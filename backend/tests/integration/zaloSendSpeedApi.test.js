/**
 * Integration tests cho tính năng tốc độ gửi Zalo cá nhân (3 mức: safe, fast, very_fast).
 * Route: PATCH /api/zalo/accounts/:id/send-speed
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
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

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function createZaloAccount({
  ownerId,
  displayName = `Zalo ${Date.now()}`,
  delayMinMs = null,
  delayMaxMs = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default, zalo_personal_outbound_delay_min_ms, zalo_personal_outbound_delay_max_ms)
     VALUES ($1, $2, 'disconnected', true, false, $3, $4)
     RETURNING *`,
    [ownerId, displayName, delayMinMs, delayMaxMs]
  );
  return rows[0];
}

const auditRow = async (action, entityId) => {
  const { rows } = await db.query(
    `SELECT * FROM audit_logs WHERE action = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 1`,
    [action, entityId]
  );
  return rows[0] || null;
};

describe('PATCH /api/zalo/accounts/:id/send-speed', () => {
  it('đặt mức very_fast → 200, cập nhật 30.000/60.000ms trong DB, response có sendSpeed very_fast', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_vf' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-speed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendSpeed: 'very_fast' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sendSpeed).toBe('very_fast');

    const { rows } = await db.query(
      'SELECT zalo_personal_outbound_delay_min_ms, zalo_personal_outbound_delay_max_ms FROM zalo_settings WHERE id = $1',
      [account.id]
    );
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBe(30_000);
    expect(rows[0].zalo_personal_outbound_delay_max_ms).toBe(60_000);
  });

  it('đặt mức fast → 200, cập nhật 50.000/100.000ms trong DB, response có sendSpeed fast', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_f' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-speed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendSpeed: 'fast' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sendSpeed).toBe('fast');

    const { rows } = await db.query(
      'SELECT zalo_personal_outbound_delay_min_ms, zalo_personal_outbound_delay_max_ms FROM zalo_settings WHERE id = $1',
      [account.id]
    );
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBe(50_000);
    expect(rows[0].zalo_personal_outbound_delay_max_ms).toBe(100_000);
  });

  it('đặt mức safe (từ mức fast trước đó) → 200, DB về NULL/NULL, response có sendSpeed safe', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_safe' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({
      ownerId: owner.id,
      delayMinMs: 50_000,
      delayMaxMs: 100_000,
    });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-speed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendSpeed: 'safe' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sendSpeed).toBe('safe');

    const { rows } = await db.query(
      'SELECT zalo_personal_outbound_delay_min_ms, zalo_personal_outbound_delay_max_ms FROM zalo_settings WHERE id = $1',
      [account.id]
    );
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBeNull();
    expect(rows[0].zalo_personal_outbound_delay_max_ms).toBeNull();
  });

  it('tên mức không hợp lệ (vd: super_fast) → 400', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_invalid_name' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-speed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendSpeed: 'super_fast' });

    expect(res.status).toBe(400);
  });

  it('body RỖNG → 400 (bắt buộc exists(), không được xoá hay đổi mức)', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_empty_body' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({
      ownerId: owner.id,
      delayMinMs: 50_000,
      delayMaxMs: 100_000,
    });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-speed`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    const msgs = Array.isArray(res.body.errors)
      ? res.body.errors.map((e) => e.msg)
      : [res.body.message || ''];
    expect(msgs.some((m) => m.includes('Thiếu sendSpeed'))).toBe(true);

    const { rows } = await db.query(
      'SELECT zalo_personal_outbound_delay_min_ms, zalo_personal_outbound_delay_max_ms FROM zalo_settings WHERE id = $1',
      [account.id]
    );
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBe(50_000);
    expect(rows[0].zalo_personal_outbound_delay_max_ms).toBe(100_000);
  });

  it('sửa tài khoản của workspace khác → 404, không sửa được', async () => {
    const ownerA = await createUser({ role: 'user', username: 'zalo_speed_owner_a' });
    const ownerB = await createUser({ role: 'user', username: 'zalo_speed_owner_b' });
    const tokenB = await loginAs(ownerB);
    const accountA = await createZaloAccount({ ownerId: ownerA.id });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${accountA.id}/send-speed`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ sendSpeed: 'very_fast' });

    expect(res.status).toBe(404);

    const { rows } = await db.query(
      'SELECT zalo_personal_outbound_delay_min_ms, zalo_personal_outbound_delay_max_ms FROM zalo_settings WHERE id = $1',
      [accountA.id]
    );
    expect(rows[0].zalo_personal_outbound_delay_min_ms).toBeNull();
  });

  it('ghi audit log ZALO_ACCOUNT_SEND_SPEED_UPDATED với previous và next đúng tên mức', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_audit' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({
      ownerId: owner.id,
      delayMinMs: 50_000,
      delayMaxMs: 100_000, // fast
    });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-speed`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sendSpeed: 'very_fast' });

    expect(res.status).toBe(200);

    const log = await auditRow('ZALO_ACCOUNT_SEND_SPEED_UPDATED', account.id);
    expect(log).not.toBeNull();
    expect(log.details).toMatchObject({
      previous: 'fast',
      next: 'very_fast',
    });
  });

  it('GET /api/zalo/accounts trả về đúng sendSpeed (kể cả custom cho giá trị SQL tay)', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_speed_list' });
    const token = await loginAs(owner);

    // Tạo 4 account: safe, fast, very_fast, custom (do SQL tay)
    const accSafe = await createZaloAccount({ ownerId: owner.id, delayMinMs: null, delayMaxMs: null });
    const accFast = await createZaloAccount({ ownerId: owner.id, delayMinMs: 50_000, delayMaxMs: 100_000 });
    const accVf = await createZaloAccount({ ownerId: owner.id, delayMinMs: 30_000, delayMaxMs: 60_000 });
    const accCustom = await createZaloAccount({ ownerId: owner.id, delayMinMs: 40_000, delayMaxMs: 80_000 });

    const res = await request(app)
      .get('/api/zalo/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const list = res.body.data.items;
    const findInList = (id) => list.find((item) => String(item.id) === String(id));

    expect(findInList(accSafe.id).sendSpeed).toBe('safe');
    expect(findInList(accFast.id).sendSpeed).toBe('fast');
    expect(findInList(accVf.id).sendSpeed).toBe('very_fast');
    expect(findInList(accCustom.id).sendSpeed).toBe('custom');
  });
});
