/**
 * H1 mục 1 (PLAN_SUA_AI_DOT3, D-02): /api/system/payment-account (+ /qr) đã gỡ — request thật phải ra 404 của app,
 * KHÔNG còn 200/503 của route cũ. Không đăng nhập, không mock gì (route cũ vốn công khai).
 *
 * Bảng `system_payment_accounts` còn trong CSDL (migration 230 giữ nguyên): có hàng cũng không lộ ra ngoài nữa.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll } = await import('./helpers/db.js');

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

describe('/api/system/payment-account đã gỡ', () => {
  it('GET /api/system/payment-account → 404 "Route not found" (không còn 503 NO_PAYMENT_ACCOUNT / 200)', async () => {
    const res = await request(app).get('/api/system/payment-account');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Route not found' });
  });

  it('POST /api/system/payment-account/qr → 404, kể cả khi bảng còn một tài khoản đang bật (không lộ STK ra ngoài)', async () => {
    await db.query(
      `INSERT INTO system_payment_accounts (account_name, account_number, bank_bin, bank_name, is_active, is_default)
       VALUES ('CONG TY TEST', '0123456789', '970436', 'Vietcombank', true, true)`
    );
    const res = await request(app)
      .post('/api/system/payment-account/qr')
      .send({ amount: 100000, description: 'THANHTOAN' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: 'Route not found' });
    expect(JSON.stringify(res.body)).not.toContain('0123456789');
  });
});
