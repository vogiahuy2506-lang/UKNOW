/**
 * Integration tests cho public email tracking endpoints (không cần auth):
 *   - GET /api/customers/email-tracking/open/:token     — pixel 1x1
 *   - GET /api/customers/email-tracking/click/:token    — 302 redirect + tracking
 *   - GET /api/customers/email-tracking/unsubscribe/:token — HTML response
 *
 * Phạm vi:
 *   - Token rỗng / không match → response vẫn 200 (pixel/redirect default).
 *   - Open: tăng open_count, set status='opened', upsert campaign_customers,
 *     update campaigns.total_opened, dedup customer_journey event.
 *   - Click: 302 redirect tới `url`, append UTM, tăng click_count, set status='clicked',
 *     auto-infer email_opened nếu chưa có, dedup theo (email_message, customer, linkKey).
 *   - Unsubscribe: GET chỉ hiện trang xác nhận (KHÔNG đổi gì); POST mới đặt customers.email_subscribed=false,
 *     journey event 'email_unsubscribed', và huỷ mọi dòng khách trùng email trong workspace.
 *   - Open redirect: token sai/không có → về FRONTEND_URL, không chuyển tới URL tuỳ ý.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function createCustomer({ userId, email = 'a@u.local' }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING *`,
    [userId, email]
  );
  return rows[0];
}

async function createCampaign({ userId, name = 'C' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status, total_opened, total_clicked)
     VALUES ($1, $2, 'running', 0, 0) RETURNING *`,
    [userId, name]
  );
  return rows[0];
}

async function createEmailMessage({ token, campaignId, customerId, runId = null, status = 'sent' }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (tracking_token, id_campaign, id_customer, id_run, status, open_count, click_count)
     VALUES ($1, $2, $3, $4, $5, 0, 0) RETURNING *`,
    [token, campaignId, customerId, runId, status]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/customers/email-tracking/open/:token', () => {
  it('token rỗng / không tồn tại → vẫn trả pixel 1x1 GIF (200)', async () => {
    const res = await request(app).get('/api/customers/email-tracking/open/nonexistent-token');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/gif');
    // GIF89a 1x1 transparent pixel ~43 bytes
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
    expect(Number(res.headers['content-length'])).toBeLessThan(100);
  });

  it('token match → tăng open_count + set status=opened + ghi journey', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({
      token: 'open-token-1',
      campaignId: campaign.id,
      customerId: customer.id,
    });

    const res = await request(app).get('/api/customers/email-tracking/open/open-token-1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/gif');

    const { rows: emRows } = await db.query(
      `SELECT open_count, status, first_opened_at, last_opened_at FROM email_messages WHERE id = $1`,
      [em.id]
    );
    expect(emRows[0].open_count).toBe(1);
    expect(emRows[0].status).toBe('opened');
    expect(emRows[0].first_opened_at).not.toBeNull();

    const { rows: cuRows } = await db.query(
      `SELECT last_email_opened_at FROM customers WHERE id = $1`,
      [customer.id]
    );
    expect(cuRows[0].last_email_opened_at).not.toBeNull();

    const { rows: cjRows } = await db.query(
      `SELECT event_type, event_data FROM customer_journey WHERE id_customer = $1`,
      [customer.id]
    );
    expect(cjRows).toHaveLength(1);
    expect(cjRows[0].event_type).toBe('email_opened');
    expect(cjRows[0].event_data).toMatchObject({ trackingToken: 'open-token-1' });
  });

  it('upsert campaign_customers + tăng total_opened campaign + ensure campaign_participations', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({
      token: 'open-cc',
      campaignId: campaign.id,
      customerId: customer.id,
    });

    await request(app).get('/api/customers/email-tracking/open/open-cc');

    const { rows: ccRows } = await db.query(
      `SELECT email_opened_count, has_opened, first_email_opened_at FROM campaign_customers
       WHERE id_campaign = $1 AND id_customer = $2`,
      [campaign.id, customer.id]
    );
    expect(ccRows[0]).toMatchObject({ email_opened_count: 1, has_opened: true });
    expect(ccRows[0].first_email_opened_at).not.toBeNull();

    const { rows: campaignRows } = await db.query(`SELECT total_opened FROM campaigns WHERE id = $1`, [campaign.id]);
    expect(campaignRows[0].total_opened).toBe(1);

    const { rows: cpRows } = await db.query(
      `SELECT id_customer FROM campaign_participations WHERE id_campaign = $1`,
      [campaign.id]
    );
    expect(cpRows).toHaveLength(1);
  });

  it('mở 2 lần → email_messages.open_count = 2 nhưng journey chỉ ghi 1 event (dedup)', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({
      token: 'open-dup',
      campaignId: campaign.id,
      customerId: customer.id,
    });
    await request(app).get('/api/customers/email-tracking/open/open-dup');
    await request(app).get('/api/customers/email-tracking/open/open-dup');

    const { rows: emRows } = await db.query(`SELECT open_count FROM email_messages WHERE id = $1`, [em.id]);
    expect(emRows[0].open_count).toBe(2);

    const { rows: cjRows } = await db.query(
      `SELECT COUNT(*)::int AS c FROM customer_journey
       WHERE event_type = 'email_opened' AND id_customer = $1`,
      [customer.id]
    );
    expect(cjRows[0].c).toBe(1);
  });

  it('email_message không có id_customer → không ghi journey + không upsert campaign_customers', async () => {
    const user = await createUser();
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({
      token: 'open-orphan',
      campaignId: campaign.id,
      customerId: null,
    });
    const res = await request(app).get('/api/customers/email-tracking/open/open-orphan');
    expect(res.status).toBe(200);

    const cj = await db.query(`SELECT COUNT(*)::int AS c FROM customer_journey`);
    expect(cj.rows[0].c).toBe(0);
    const cc = await db.query(`SELECT COUNT(*)::int AS c FROM campaign_customers`);
    expect(cc.rows[0].c).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/customers/email-tracking/click/:token', () => {
  it('không có url query → redirect tới FRONTEND_URL default', async () => {
    const res = await request(app).get('/api/customers/email-tracking/click/nonexistent-click');
    expect(res.status).toBe(302);
    // FRONTEND_URL không set trong test → fallback http://localhost:5173
    expect(res.headers.location).toMatch(/^https?:\/\//);
  });

  it('có url query hợp lệ + token match → redirect với UTM appended', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({
      token: 'click-token-1',
      campaignId: campaign.id,
      customerId: customer.id,
    });

    const dest = encodeURIComponent('https://example.com/page');
    const res = await request(app).get(`/api/customers/email-tracking/click/click-token-1?url=${dest}`);
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe('https://example.com/page');
    expect(url.searchParams.get('utm_source')).toBe('email_campaign');
    expect(url.searchParams.get('utm_campaign')).toBe(String(campaign.id));
    expect(url.searchParams.get('utm_customer')).toBe(String(customer.id));
    expect(url.searchParams.get('utm_id_email')).toBeTruthy();
  });

  it('url có scheme javascript → bỏ qua, dùng default', async () => {
    const dest = encodeURIComponent('javascript:alert(1)');
    const res = await request(app).get(`/api/customers/email-tracking/click/nonexistent?url=${dest}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toMatch(/javascript:/i);
  });

  it('token match → tăng click_count + status=clicked + ghi journey email_clicked', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({
      token: 'click-track',
      campaignId: campaign.id,
      customerId: customer.id,
    });
    await request(app).get(`/api/customers/email-tracking/click/click-track?url=${encodeURIComponent('https://example.com')}`);

    const { rows: emRows } = await db.query(
      `SELECT click_count, status, first_clicked_at FROM email_messages WHERE id = $1`,
      [em.id]
    );
    expect(emRows[0]).toMatchObject({ click_count: 1, status: 'clicked' });
    expect(emRows[0].first_clicked_at).not.toBeNull();

    const { rows: cjRows } = await db.query(
      `SELECT event_type FROM customer_journey WHERE id_customer = $1 ORDER BY id`,
      [customer.id]
    );
    // 2 events: auto-inferred email_opened + email_clicked
    const types = cjRows.map((r) => r.event_type).sort();
    expect(types).toEqual(['email_clicked', 'email_opened']);
  });

  it('auto-infer email_opened khi chưa có (status sent → opened); KHÔNG infer nếu đã có open trước', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({
      token: 'click-already-opened',
      campaignId: campaign.id,
      customerId: customer.id,
    });
    // Insert sẵn event email_opened
    await db.query(
      `INSERT INTO customer_journey (id_customer, id_campaign, id_email_message, event_type, event_channel)
       VALUES ($1, $2, $3, 'email_opened', 'email')`,
      [customer.id, campaign.id, em.id]
    );

    await request(app).get(`/api/customers/email-tracking/click/click-already-opened?url=${encodeURIComponent('https://x.com')}`);

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS c FROM customer_journey
       WHERE id_customer = $1 AND event_type = 'email_opened'`,
      [customer.id]
    );
    expect(rows[0].c).toBe(1); // không infer thêm
  });

  it('dedup email_clicked theo linkKey — cùng lk gọi 2 lần chỉ ghi 1 event', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({
      token: 'click-lk-dedup',
      campaignId: campaign.id,
      customerId: customer.id,
    });

    const url = encodeURIComponent('https://example.com/btn');
    await request(app).get(`/api/customers/email-tracking/click/click-lk-dedup?url=${url}&lk=btn-cta`);
    await request(app).get(`/api/customers/email-tracking/click/click-lk-dedup?url=${url}&lk=btn-cta`);

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS c FROM customer_journey
       WHERE id_customer = $1 AND event_type = 'email_clicked'`,
      [customer.id]
    );
    expect(rows[0].c).toBe(1);
  });

  it('upsert campaign_customers tăng email_clicked_count + has_clicked=TRUE', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({
      token: 'click-cc',
      campaignId: campaign.id,
      customerId: customer.id,
    });
    await request(app).get(`/api/customers/email-tracking/click/click-cc?url=${encodeURIComponent('https://x.com')}`);

    const { rows } = await db.query(
      `SELECT email_clicked_count, has_clicked, first_email_clicked_at FROM campaign_customers
       WHERE id_campaign = $1 AND id_customer = $2`,
      [campaign.id, customer.id]
    );
    expect(rows[0]).toMatchObject({ email_clicked_count: 1, has_clicked: true });
    expect(rows[0].first_email_clicked_at).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('/api/customers/email-tracking/unsubscribe/:token', () => {
  it('POST token không tồn tại → 200 HTML "Đã hủy đăng ký" (graceful)', async () => {
    const res = await request(app).post('/api/customers/email-tracking/unsubscribe/no-such-token');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Đã hủy đăng ký|Unsubscribed/);
  });

  it('POST token match → set customers.email_subscribed=false + ghi journey email_unsubscribed', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({
      token: 'unsub-token-1',
      campaignId: campaign.id,
      customerId: customer.id,
    });
    // customers.email_subscribed default TRUE
    expect((await db.query(`SELECT email_subscribed FROM customers WHERE id = $1`, [customer.id])).rows[0].email_subscribed).toBe(true);

    const res = await request(app).post('/api/customers/email-tracking/unsubscribe/unsub-token-1');
    expect(res.status).toBe(200);

    const { rows: cuRows } = await db.query(
      `SELECT email_subscribed, email_unsubscribed_at FROM customers WHERE id = $1`,
      [customer.id]
    );
    expect(cuRows[0].email_subscribed).toBe(false);
    expect(cuRows[0].email_unsubscribed_at).not.toBeNull();

    const { rows: emRows } = await db.query(`SELECT status FROM email_messages WHERE id = $1`, [em.id]);
    expect(emRows[0].status).toBe('unsubscribed');

    const { rows: cjRows } = await db.query(
      `SELECT event_type, event_data FROM customer_journey WHERE id_customer = $1`,
      [customer.id]
    );
    expect(cjRows).toHaveLength(1);
    expect(cjRows[0].event_type).toBe('email_unsubscribed');
    expect(cjRows[0].event_data).toMatchObject({ trackingToken: 'unsub-token-1' });
  });

  it('POST unsubscribe 2 lần → vẫn 200 nhưng journey chỉ ghi 1 event (dedup)', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({
      token: 'unsub-dup',
      campaignId: campaign.id,
      customerId: customer.id,
    });
    await request(app).post('/api/customers/email-tracking/unsubscribe/unsub-dup');
    await request(app).post('/api/customers/email-tracking/unsubscribe/unsub-dup');

    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS c FROM customer_journey
       WHERE id_customer = $1 AND event_type = 'email_unsubscribed'`,
      [customer.id]
    );
    expect(rows[0].c).toBe(1);
  });

  it('GET chỉ hiện trang xác nhận có nút POST — KHÔNG đổi email_subscribed (trình quét link tự mở GET)', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    const em = await createEmailMessage({ token: 'unsub-get-only', campaignId: campaign.id, customerId: customer.id });

    const res = await request(app).get('/api/customers/email-tracking/unsubscribe/unsub-get-only');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<form method="POST">/);

    const { rows } = await db.query(`SELECT email_subscribed, email_unsubscribed_at FROM customers WHERE id = $1`, [customer.id]);
    expect(rows[0].email_subscribed).toBe(true);
    expect(rows[0].email_unsubscribed_at).toBeNull();
    expect((await db.query(`SELECT status FROM email_messages WHERE id = $1`, [em.id])).rows[0].status).toBe('sent');
    expect((await db.query(`SELECT COUNT(*)::int AS c FROM customer_journey WHERE id_customer = $1`, [customer.id])).rows[0].c).toBe(0);
  });

  it('POST huỷ mọi dòng khách cùng email (khác hoa/thường) trong workspace; KHÔNG đụng workspace khác', async () => {
    const user = await createUser();
    const other = await createUser({ username: 'unsub_other_tenant' });
    const c1 = await createCustomer({ userId: user.id, email: 'Dup@u.local' });
    const c2 = await createCustomer({ userId: user.id, email: 'dup@u.local' });
    const c3 = await createCustomer({ userId: user.id, email: 'khac@u.local' });
    const otherTenant = await createCustomer({ userId: other.id, email: 'dup@u.local' });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({ token: 'unsub-dup-email', campaignId: campaign.id, customerId: c1.id });

    const res = await request(app).post('/api/customers/email-tracking/unsubscribe/unsub-dup-email');
    expect(res.status).toBe(200);

    const { rows } = await db.query(
      `SELECT id, email_subscribed FROM customers WHERE id = ANY($1::int[]) ORDER BY id`,
      [[c1.id, c2.id, c3.id, otherTenant.id]]
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.email_subscribed]));
    expect(byId[c1.id]).toBe(false);
    expect(byId[c2.id]).toBe(false);
    expect(byId[c3.id]).toBe(true);
    expect(byId[otherTenant.id]).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Lớp gửi — findCustomerByEmail gộp mọi bản trùng email trong workspace', () => {
  it('2 dòng trùng email, 1 đã huỷ → coi là đã huỷ (dù dòng đã huỷ có id nhỏ hơn dòng còn đăng ký)', async () => {
    const { default: senderRepo } = await import('../../src/repositories/campaign/campaignEmailSender.repository.js');
    const user = await createUser();
    const first = await createCustomer({ userId: user.id, email: 'same@u.local' });
    const second = await createCustomer({ userId: user.id, email: 'SAME@u.local' });
    // Bản ĐÃ HUỶ là dòng id nhỏ; bản còn đăng ký có id lớn — `LIMIT 1` theo bất kỳ thứ tự nào đều có thể chọn nhầm.
    await db.query(`UPDATE customers SET email_subscribed = false WHERE id = $1`, [first.id]);

    const row = await senderRepo.findCustomerByEmail(user.id, 'same@u.local');
    expect(row.email_subscribed).toBe(false);
    expect(row.id).toBe(first.id); // id ổn định = dòng cũ nhất
    expect(Number(second.id)).toBeGreaterThan(Number(first.id));
  });

  it('2 dòng trùng email, 1 hard bounce → email_hard_bounced = true', async () => {
    const { default: senderRepo } = await import('../../src/repositories/campaign/campaignEmailSender.repository.js');
    const user = await createUser();
    const first = await createCustomer({ userId: user.id, email: 'bounce@u.local' });
    await createCustomer({ userId: user.id, email: 'bounce@u.local' });
    await db.query(`UPDATE customers SET email_hard_bounced = true WHERE id = $1`, [first.id]);

    const row = await senderRepo.findCustomerByEmail(user.id, 'bounce@u.local');
    expect(row.email_hard_bounced).toBe(true);
    expect(row.email_subscribed).toBe(true);
  });

  it('không có dòng nào → null; dòng của workspace khác không bị tính', async () => {
    const { default: senderRepo } = await import('../../src/repositories/campaign/campaignEmailSender.repository.js');
    const user = await createUser();
    const other = await createUser({ username: 'sender_other_tenant' });
    const foreign = await createCustomer({ userId: other.id, email: 'x@u.local' });
    await db.query(`UPDATE customers SET email_subscribed = false WHERE id = $1`, [foreign.id]);

    expect(await senderRepo.findCustomerByEmail(user.id, 'x@u.local')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('Open redirect — click email với token sai', () => {
  const OLD = process.env.FRONTEND_URL;
  beforeAll(() => { process.env.FRONTEND_URL = 'https://app.example.test'; });
  afterAll(() => { if (OLD === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = OLD; });

  it('token không tồn tại + url ngoài → về FRONTEND_URL, không tới trang kẻ lạ', async () => {
    const dest = encodeURIComponent('https://evil.example/phish');
    const res = await request(app).get(`/api/customers/email-tracking/click/khong-co-token?url=${dest}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://app.example.test');
  });

  it('token hợp lệ + url https → vẫn chuyển hướng tới url đó', async () => {
    const user = await createUser();
    const customer = await createCustomer({ userId: user.id });
    const campaign = await createCampaign({ userId: user.id });
    await createEmailMessage({ token: 'redir-ok', campaignId: campaign.id, customerId: customer.id });
    const dest = encodeURIComponent('https://example.com/ok');
    const res = await request(app).get(`/api/customers/email-tracking/click/redir-ok?url=${dest}`);
    expect(res.headers.location).toMatch(/^https:\/\/example\.com\/ok/);
  });
});
