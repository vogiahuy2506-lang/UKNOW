/**
 * Integration — GET /api/dashboard/getting-started (thẻ "3 bước bắt đầu" ở trang chủ,
 * PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27).
 *
 * Chạy trên Postgres thật vì ba cờ là ĐIỀU KIỆN SQL, mock không bắt được:
 *   - channelConnected: Zalo phải `connected` VÀ `is_active` (nick needs_reauth / disconnected / logged_out KHÔNG tính),
 *     email `active`, Telegram `is_active`; tài khoản của chủ KHÁC không tính.
 *   - hasCustomers: khách của workspace này (không lẫn khách người khác).
 *   - hasSentMessage: tin ĐÃ GỬI qua sendStats — tin lỗi / xếp hàng / gửi thử không tính.
 * Nhân viên (X-Owner-Context) nhận 403 OWNER_ONLY từ requireSelfContext.
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

const getStatus = (token) => request(app).get('/api/dashboard/getting-started').set('Authorization', `Bearer ${token}`);

/** Chủ tài khoản mới tinh + token. */
async function setupOwner(username = 'gs_owner') {
  const owner = await createUser({ username, role: 'user' });
  const token = await loginAs(owner);
  return { owner, token };
}

const addZalo = (userId, { status = 'connected', isActive = true } = {}) => db.query(
  `INSERT INTO zalo_settings (id_user, display_name, status, is_active) VALUES ($1, 'Zalo', $2, $3)`,
  [userId, status, isActive]
);
const addEmailAccount = (userId, { status = 'active' } = {}) => db.query(
  `INSERT INTO email_settings (id_user, name, email, status) VALUES ($1, 'Mail', $2, $3)`,
  [userId, `mail${userId}@brand.test`, status]
);
const addTelegram = (userId, { isActive = true } = {}) => db.query(
  `INSERT INTO telegram_accounts (id_user, telegram_user_id, is_active) VALUES ($1, $2, $3)`,
  [userId, 700000 + Number(userId), isActive]
);
const addCustomer = (userId, email) => db.query(
  `INSERT INTO customers (id_user, email, full_name) VALUES ($1, $2, 'Khach')`,
  [userId, email]
);
const addEmailMessage = (ownerId, { status = 'sent', preview = false } = {}) => db.query(
  `INSERT INTO email_messages (workspace_owner_id, recipient_email, status, is_preview, sent_at)
   VALUES ($1, 'to@x.test', $2, $3, NOW())`,
  [ownerId, status, preview]
);

describe('GET /api/dashboard/getting-started — quyền truy cập', () => {
  it('không token → 401', async () => {
    const res = await request(app).get('/api/dashboard/getting-started');
    expect(res.status).toBe(401);
  });

  it('nhân viên đang đứng trong không gian của chủ (X-Owner-Context) → 403 OWNER_ONLY, dù chủ có đủ cả ba bước', async () => {
    const { owner } = await setupOwner('gs_boss');
    await addZalo(owner.id);
    await addCustomer(owner.id, 'a@x.test');
    await addEmailMessage(owner.id);
    const employee = await createUser({ username: 'gs_staff', role: 'user' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status)
       VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ reports_view: true, customers: true, campaigns_view: true })]
    );
    const employeeToken = await loginAs(employee);

    const res = await request(app)
      .get('/api/dashboard/getting-started')
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_ONLY');
    expect(res.body.data).toBeUndefined();
  });
});

describe('GET /api/dashboard/getting-started — chủ tài khoản', () => {
  it('chưa có gì → ba cờ false, đúng hình dạng { success, data }', async () => {
    const { token } = await setupOwner();

    const res = await getStatus(token);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { channelConnected: false, hasCustomers: false, hasSentMessage: false },
    });
  });

  describe('channelConnected', () => {
    it('Zalo needs_reauth là nick DUY NHẤT → false (phiên hết hạn không phải đã nối)', async () => {
      const { owner, token } = await setupOwner();
      await addZalo(owner.id, { status: 'needs_reauth' });

      const res = await getStatus(token);

      expect(res.body.data.channelConnected).toBe(false);
    });

    it.each(['disconnected', 'logged_out', 'pending'])('Zalo status=%s → false', async (status) => {
      const { owner, token } = await setupOwner();
      await addZalo(owner.id, { status });

      expect((await getStatus(token)).body.data.channelConnected).toBe(false);
    });

    it('Zalo connected nhưng is_active=false (đã tắt) → false', async () => {
      const { owner, token } = await setupOwner();
      await addZalo(owner.id, { status: 'connected', isActive: false });

      expect((await getStatus(token)).body.data.channelConnected).toBe(false);
    });

    it('Zalo connected + is_active → true', async () => {
      const { owner, token } = await setupOwner();
      await addZalo(owner.id, { status: 'needs_reauth' });
      await addZalo(owner.id, { status: 'connected' });

      expect((await getStatus(token)).body.data.channelConnected).toBe(true);
    });

    it('email status=active → true; status=inactive → false', async () => {
      const { owner, token } = await setupOwner();
      await addEmailAccount(owner.id, { status: 'inactive' });
      expect((await getStatus(token)).body.data.channelConnected).toBe(false);

      await addEmailAccount(owner.id, { status: 'active' });
      expect((await getStatus(token)).body.data.channelConnected).toBe(true);
    });

    it('Telegram is_active=true → true; is_active=false → false', async () => {
      const { owner, token } = await setupOwner();
      await addTelegram(owner.id, { isActive: false });
      expect((await getStatus(token)).body.data.channelConnected).toBe(false);

      await db.query('UPDATE telegram_accounts SET is_active = TRUE WHERE id_user = $1', [owner.id]);
      expect((await getStatus(token)).body.data.channelConnected).toBe(true);
    });

    it('tài khoản kênh đã nối của chủ KHÁC không tính cho chủ này', async () => {
      const { token } = await setupOwner('gs_me');
      const other = await createUser({ username: 'gs_other', role: 'user' });
      await addZalo(other.id);
      await addEmailAccount(other.id);
      await addTelegram(other.id);

      expect((await getStatus(token)).body.data.channelConnected).toBe(false);
    });
  });

  describe('hasCustomers', () => {
    it('có khách trong workspace → true; khách của người khác không tính', async () => {
      const { owner, token } = await setupOwner();
      const other = await createUser({ username: 'gs_other2', role: 'user' });
      await addCustomer(other.id, 'x@other.test');
      expect((await getStatus(token)).body.data.hasCustomers).toBe(false);

      await addCustomer(owner.id, 'mine@x.test');
      expect((await getStatus(token)).body.data.hasCustomers).toBe(true);
    });
  });

  describe('hasSentMessage', () => {
    it('tin lỗi / xếp hàng / gửi thử KHÔNG tính; một tin đã gửi → true', async () => {
      const { owner, token } = await setupOwner();
      await addEmailMessage(owner.id, { status: 'failed' });
      await addEmailMessage(owner.id, { status: 'queued' });
      await addEmailMessage(owner.id, { status: 'sent', preview: true });
      expect((await getStatus(token)).body.data.hasSentMessage).toBe(false);

      await addEmailMessage(owner.id, { status: 'sent' });
      expect((await getStatus(token)).body.data.hasSentMessage).toBe(true);
    });

    it('tin đã gửi của chủ KHÁC không tính', async () => {
      const { token } = await setupOwner();
      const other = await createUser({ username: 'gs_other3', role: 'user' });
      await addEmailMessage(other.id, { status: 'sent' });

      expect((await getStatus(token)).body.data.hasSentMessage).toBe(false);
    });
  });

  it('đủ cả ba bước → ba cờ true', async () => {
    const { owner, token } = await setupOwner();
    await addEmailAccount(owner.id);
    await addCustomer(owner.id, 'c@x.test');
    await addEmailMessage(owner.id);

    const res = await getStatus(token);

    expect(res.body.data).toEqual({ channelConnected: true, hasCustomers: true, hasSentMessage: true });
  });
});
