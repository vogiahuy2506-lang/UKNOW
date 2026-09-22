/**
 * PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22, PR-3 Việc 6/7 — API đặt giới hạn gửi/ngày cho tài khoản.
 *
 * Email: PUT /api/email-settings/:id (đường có sẵn, thêm field userDailySendLimit).
 * Zalo: PATCH /api/zalo/accounts/:id/send-limit (đường MỚI, chưa tồn tại trước PR này).
 *
 * Ca quan trọng nhất (bẫy 8 của plan): xoá trắng ô đang có giá trị phải về NULL thật trong DB.
 * Khuôn update() dùng COALESCE cho các cột khác — nếu lỡ tay áp COALESCE cho cột này, gửi
 * userDailySendLimit: null sẽ bị "giữ nguyên giá trị cũ" một cách im lặng, đúng thứ bẫy 8 cảnh báo.
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

async function createEmailAccount({ ownerId, name = 'Sender chính', email = `s${Date.now()}@example.com`, userDailySendLimit = null }) {
  // email_mode = 'smtp' để né nhánh 'platform' của emailSettingsCrudService.update() (đòi
  // DEFAULT_FROM_DOMAIN — biến môi trường không đặt trong test, không liên quan tới PR này).
  const { rows } = await db.query(
    `INSERT INTO email_settings (id_user, name, email, reply_to, status, email_mode, user_daily_send_limit)
     VALUES ($1, $2, $3, $3, 'active', 'smtp', $4)
     RETURNING *`,
    [ownerId, name, email, userDailySendLimit]
  );
  return rows[0];
}

async function createZaloAccount({ ownerId, displayName = `Zalo ${Date.now()}`, userDailySendLimit = null }) {
  const { rows } = await db.query(
    `INSERT INTO zalo_settings (id_user, display_name, status, is_active, is_default, user_daily_send_limit)
     VALUES ($1, $2, 'disconnected', true, false, $3)
     RETURNING *`,
    [ownerId, displayName, userDailySendLimit]
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

describe('PUT /api/email-settings/:id — userDailySendLimit', () => {
  it('không gửi field này → cột giữ nguyên (không bị vô tình xoá bởi COALESCE null)', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_keep' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id, userDailySendLimit: 77 });

    const res = await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Đổi tên thôi' });

    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM email_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(77);
  });

  it('gửi số hợp lệ → lưu đúng giá trị, trả lại trong response', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_set' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id });

    const res = await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 200 });

    expect(res.status).toBe(200);
    expect(res.body.data.userDailySendLimit).toBe(200);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM email_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(200);
  });

  it('BẪY 8 — xoá trắng (gửi null) khi đang có giá trị → về NULL thật trong DB, không bị COALESCE giữ lại', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_clear' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id, userDailySendLimit: 150 });

    const res = await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: null });

    expect(res.status).toBe(200);
    expect(res.body.data.userDailySendLimit).toBeNull();
    const { rows } = await db.query('SELECT user_daily_send_limit FROM email_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBeNull();
  });

  it('nhập 150 (> 100) → vẫn lưu được (chỉ là cảnh báo chính sách, không phải trần kỹ thuật)', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_150' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id });

    const res = await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 150 });

    expect(res.status).toBe(200);
    expect(res.body.data.userDailySendLimit).toBe(150);
  });

  it('nhập 100001 (> trần kỹ thuật) → 400, không lưu', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_over' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id, userDailySendLimit: 50 });

    const res = await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 100001 });

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM email_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(50);
  });

  it('nhập 0 hoặc số âm → 400 từ validator', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_zero' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id });

    const zero = await request(app).put(`/api/email-settings/${account.id}`).set('Authorization', `Bearer ${token}`).send({ userDailySendLimit: 0 });
    const negative = await request(app).put(`/api/email-settings/${account.id}`).set('Authorization', `Bearer ${token}`).send({ userDailySendLimit: -5 });

    expect(zero.status).toBe(400);
    expect(negative.status).toBe(400);
  });

  it('đổi giới hạn → ghi audit EMAIL_ACCOUNT_SEND_LIMIT_UPDATED với giá trị cũ/mới + exceededRecommended', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_audit' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id, userDailySendLimit: 30 });

    await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 500 });

    const row = await auditRow('EMAIL_ACCOUNT_SEND_LIMIT_UPDATED', account.id);
    expect(row).not.toBeNull();
    expect(row.details).toMatchObject({ previousValue: 30, newValue: 500, exceededRecommended: true });
  });

  it('sửa field khác (không đụng userDailySendLimit) → KHÔNG ghi audit send-limit', async () => {
    const owner = await createUser({ role: 'user', username: 'email_owner_no_audit' });
    const token = await loginAs(owner);
    const account = await createEmailAccount({ ownerId: owner.id, userDailySendLimit: 30 });

    await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Tên mới' });

    const row = await auditRow('EMAIL_ACCOUNT_SEND_LIMIT_UPDATED', account.id);
    expect(row).toBeNull();
  });

  it('owner khác không sửa được tài khoản không thuộc mình → 404, giá trị không đổi', async () => {
    const ownerA = await createUser({ role: 'user', username: 'email_owner_a2' });
    const ownerB = await createUser({ role: 'user', username: 'email_owner_b2' });
    const tokenB = await loginAs(ownerB);
    const account = await createEmailAccount({ ownerId: ownerA.id, userDailySendLimit: 20 });

    const res = await request(app)
      .put(`/api/email-settings/${account.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ userDailySendLimit: 999 });

    expect(res.status).toBe(404);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM email_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(20);
  });
});

describe('PATCH /api/zalo/accounts/:id/send-limit', () => {
  it('gửi số hợp lệ → lưu đúng giá trị, trả lại trong response', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_owner_set' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-limit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 80 });

    expect(res.status).toBe(200);
    expect(res.body.data.userDailySendLimit).toBe(80);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM zalo_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(80);
  });

  it('BẪY 8 — xoá trắng (gửi null) khi đang có giá trị → về NULL thật trong DB', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_owner_clear' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id, userDailySendLimit: 60 });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-limit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: null });

    expect(res.status).toBe(200);
    expect(res.body.data.userDailySendLimit).toBeNull();
    const { rows } = await db.query('SELECT user_daily_send_limit FROM zalo_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBeNull();
  });

  it('nhập 100001 → 400, không lưu', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_owner_over' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id, userDailySendLimit: 40 });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-limit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 100001 });

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM zalo_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(40);
  });

  // Soát 22/09: trước bản vá, body rỗng đi lọt qua `.optional({ nullable: true })`, controller quy
  // `undefined` → `null` và XOÁ TRẮNG giới hạn đang có, vẫn trả 200 "Đã cập nhật giới hạn gửi/ngày".
  // Đường email cùng tính năng làm ngược lại (vắng field = giữ nguyên, ca ở đầu file này), nên một
  // client gửi payload dựng có điều kiện sẽ vô tình gỡ phanh của nick mà không ai thấy gì.
  it('body RỖNG → 400, giới hạn đang có KHÔNG bị xoá (muốn xoá phải gửi null tường minh)', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_owner_empty_body' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id, userDailySendLimit: 60 });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-limit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM zalo_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(60);
  });

  it('id không tồn tại → 404', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_owner_404' });
    const token = await loginAs(owner);

    const res = await request(app)
      .patch('/api/zalo/accounts/999999/send-limit')
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 50 });

    expect(res.status).toBe(404);
  });

  it('owner khác không sửa được tài khoản không thuộc mình → 404, giá trị không đổi', async () => {
    const ownerA = await createUser({ role: 'user', username: 'zalo_owner_a2' });
    const ownerB = await createUser({ role: 'user', username: 'zalo_owner_b2' });
    const tokenB = await loginAs(ownerB);
    const account = await createZaloAccount({ ownerId: ownerA.id, userDailySendLimit: 25 });

    const res = await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-limit`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ userDailySendLimit: 999 });

    expect(res.status).toBe(404);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM zalo_settings WHERE id = $1', [account.id]);
    expect(rows[0].user_daily_send_limit).toBe(25);
  });

  it('đổi giới hạn → ghi audit ZALO_ACCOUNT_SEND_LIMIT_UPDATED với giá trị cũ/mới + exceededRecommended', async () => {
    const owner = await createUser({ role: 'user', username: 'zalo_owner_audit' });
    const token = await loginAs(owner);
    const account = await createZaloAccount({ ownerId: owner.id, userDailySendLimit: 40 });

    await request(app)
      .patch(`/api/zalo/accounts/${account.id}/send-limit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 150 });

    const row = await auditRow('ZALO_ACCOUNT_SEND_LIMIT_UPDATED', account.id);
    expect(row).not.toBeNull();
    expect(row.details).toMatchObject({ previousValue: 40, newValue: 150, exceededRecommended: true });
  });

  it('không token → 401', async () => {
    const res = await request(app).patch('/api/zalo/accounts/1/send-limit').send({ userDailySendLimit: 10 });
    expect(res.status).toBe(401);
  });
});
