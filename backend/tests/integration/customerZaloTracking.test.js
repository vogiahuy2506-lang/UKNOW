/**
 * Integration test cho public Zalo click tracking: GET /api/customers/zalo-tracking/click/:token
 *
 * Trọng tâm (PR-C1 khách hàng):
 *   - `?url=` do người ngoài tự đặt được → `utm_customer` KHÔNG được tin nếu khách đó không thuộc
 *     workspace của chiến dịch (trước đây gán chéo tenant + ghi zalo_id vào khách người khác).
 *   - Token sai/không có → về FRONTEND_URL, không open redirect.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import customerZaloTrackingRepository from '../../src/repositories/customer/customerZaloTracking.repository.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
const OLD_FRONTEND_URL = process.env.FRONTEND_URL;

beforeAll(() => {
  process.env.FRONTEND_URL = 'https://app.example.test';
  app = createApp();
});

afterAll(() => {
  if (OLD_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = OLD_FRONTEND_URL;
});

beforeEach(async () => {
  await truncateAll();
});

async function createCustomer({ userId, email = null }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING *`,
    [userId, email]
  );
  return rows[0];
}

async function createCampaign({ userId }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, 'Z', 'running') RETURNING *`,
    [userId]
  );
  return rows[0];
}

async function createZaloMessage({ userId, campaignId, token, customerId = null }) {
  const { rows } = await db.query(
    `INSERT INTO zalo_messages (workspace_owner_id, id_campaign, id_customer, channel, status, tracking_token)
     VALUES ($1, $2, $3, 'zalo_personal', 'sent', $4) RETURNING *`,
    [userId, campaignId, customerId, token]
  );
  return rows[0];
}

const clickUrl = (token, target) =>
  `/api/customers/zalo-tracking/click/${token}?url=${encodeURIComponent(target)}`;

describe('GET /api/customers/zalo-tracking/click/:token — gán khách qua utm_customer', () => {
  it('utm_customer là khách của workspace KHÁC → không gán message, không ghi zalo_id, không ghi journey', async () => {
    const owner = await createUser({ username: 'zalo_click_owner' });
    const victim = await createUser({ username: 'zalo_click_victim' });
    const campaign = await createCampaign({ userId: owner.id });
    const foreignCustomer = await createCustomer({ userId: victim.id, email: 'victim@u.local' });
    const msg = await createZaloMessage({ userId: owner.id, campaignId: campaign.id, token: 'zc-cross' });

    const target = `https://example.com/p?utm_customer=${foreignCustomer.id}&utm_source=zalo_person_campaign&utm_zalo_uid=attacker-uid`;
    const res = await request(app).get(clickUrl('zc-cross', target));
    expect(res.status).toBe(302);

    const m = await db.query(`SELECT id_customer, click_count FROM zalo_messages WHERE id = $1`, [msg.id]);
    expect(m.rows[0].click_count).toBe(1); // lượt bấm vẫn được đếm
    // Không gán khách của tenant khác. (Có utm_zalo_uid nên hệ thống tạo khách tạm TRONG workspace chủ chiến dịch.)
    expect(m.rows[0].id_customer).not.toBe(foreignCustomer.id);
    if (m.rows[0].id_customer !== null) {
      const placeholder = await db.query(`SELECT id_user, zalo_id FROM customers WHERE id = $1`, [m.rows[0].id_customer]);
      expect(placeholder.rows[0].id_user).toBe(owner.id);
      expect(placeholder.rows[0].zalo_id).toBe('attacker-uid');
    }

    const c = await db.query(`SELECT zalo_id FROM customers WHERE id = $1`, [foreignCustomer.id]);
    expect(c.rows[0].zalo_id).toBeNull();

    const cj = await db.query(`SELECT COUNT(*)::int AS c FROM customer_journey WHERE id_customer = $1`, [foreignCustomer.id]);
    expect(cj.rows[0].c).toBe(0);
  });

  it('utm_customer là khách CÙNG workspace → gán message + ghi zalo_id + journey (hành vi cũ giữ nguyên)', async () => {
    const owner = await createUser({ username: 'zalo_click_same' });
    const campaign = await createCampaign({ userId: owner.id });
    const customer = await createCustomer({ userId: owner.id, email: 'mine@u.local' });
    const msg = await createZaloMessage({ userId: owner.id, campaignId: campaign.id, token: 'zc-same' });

    const target = `https://example.com/p?utm_customer=${customer.id}&utm_source=zalo_person_campaign&utm_zalo_uid=uid-ok`;
    const res = await request(app).get(clickUrl('zc-same', target));
    expect(res.status).toBe(302);

    const m = await db.query(`SELECT id_customer FROM zalo_messages WHERE id = $1`, [msg.id]);
    expect(m.rows[0].id_customer).toBe(customer.id);
    const c = await db.query(`SELECT zalo_id FROM customers WHERE id = $1`, [customer.id]);
    expect(c.rows[0].zalo_id).toBe('uid-ok');
    const cj = await db.query(
      `SELECT COUNT(*)::int AS c FROM customer_journey WHERE id_customer = $1 AND event_type = 'zalo_clicked'`,
      [customer.id]
    );
    expect(cj.rows[0].c).toBe(1);
  });

  it('linkZaloUidToCustomer có điều kiện workspace: sai workspace → không ghi, đúng workspace → ghi', async () => {
    const a = await createUser({ username: 'zalo_link_a' });
    const b = await createUser({ username: 'zalo_link_b' });
    const customerOfB = await createCustomer({ userId: b.id, email: 'b@u.local' });

    await customerZaloTrackingRepository.linkZaloUidToCustomer(db, customerOfB.id, 'uid-x', a.id);
    expect((await db.query(`SELECT zalo_id FROM customers WHERE id = $1`, [customerOfB.id])).rows[0].zalo_id).toBeNull();

    await customerZaloTrackingRepository.linkZaloUidToCustomer(db, customerOfB.id, 'uid-x', b.id);
    expect((await db.query(`SELECT zalo_id FROM customers WHERE id = $1`, [customerOfB.id])).rows[0].zalo_id).toBe('uid-x');
  });
});

describe('GET /api/customers/zalo-tracking/click/:token — open redirect', () => {
  it('token không tồn tại + url ngoài → về FRONTEND_URL', async () => {
    const res = await request(app).get(clickUrl('khong-co-token', 'https://evil.example/phish'));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.example.test');
  });

  it('token hợp lệ + url https → chuyển hướng tới url đó', async () => {
    const owner = await createUser({ username: 'zalo_redir_ok' });
    const campaign = await createCampaign({ userId: owner.id });
    await createZaloMessage({ userId: owner.id, campaignId: campaign.id, token: 'zc-redir' });
    const res = await request(app).get(clickUrl('zc-redir', 'https://example.com/landing'));
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/example\.com\/landing/);
  });

  it('token hợp lệ + scheme javascript → về FRONTEND_URL', async () => {
    const owner = await createUser({ username: 'zalo_redir_js' });
    const campaign = await createCampaign({ userId: owner.id });
    await createZaloMessage({ userId: owner.id, campaignId: campaign.id, token: 'zc-js' });
    const res = await request(app).get(clickUrl('zc-js', 'javascript:alert(1)'));
    expect(res.headers.location).toBe('https://app.example.test');
  });
});
