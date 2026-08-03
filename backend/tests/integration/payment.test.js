/**
 * Integration tests cho `/api/payment` (PayOS).
 *
 * Phạm vi:
 *   - POST /create-payment: tạo order pending + gọi PayOS lấy QR.
 *   - POST /webhook       : verify chữ ký PayOS, cập nhật order, kích hoạt plan
 *                            cho user (active_plan_id + subscription_expires_at).
 *   - GET  /status/:code  : tra cứu trạng thái đơn.
 *
 * Vì `paymentService` gọi sang PayOS (network), test mock toàn bộ
 * `src/utils/payos.util.js` qua `jest.unstable_mockModule`. DB vẫn dùng thật
 * để verify đầy đủ side-effects (orders, users.active_plan_id, expires_at).
 *
 * Lưu ý ESM: mock phải khai báo TRƯỚC khi import `createApp`/helpers, vì
 * `payos.util.js` được resolve khi `payment.service.js` được load lần đầu.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// ─── Mock PayOS client (chặn network) ─────────────────────────────────────
const mockPaymentRequestsCreate = jest.fn();
const mockWebhooksVerify = jest.fn();

jest.unstable_mockModule('../../src/utils/payos.util.js', () => ({
  default: {
    paymentRequests: { create: mockPaymentRequestsCreate },
    webhooks: { verify: mockWebhooksVerify },
  },
}));

// Dynamic import sau khi mock đã được đăng ký.
const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser, createPlan } = await import('./helpers/db.js');

let app;

beforeAll(() => {
  app = createApp();
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
});

beforeEach(async () => {
  await truncateAll();
  mockPaymentRequestsCreate.mockReset();
  mockWebhooksVerify.mockReset();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

// ===========================================================================
// POST /api/payments/create-payment
// ===========================================================================
describe('POST /api/payments/create-payment', () => {
  it('không có token → 401', async () => {
    const res = await request(app)
      .post('/api/payments/create-payment')
      .send({ planCode: 'basic', userEmail: 'x@test.local' });
    expect(res.status).toBe(401);
  });

  it('thiếu planCode → 400', async () => {
    const user = await createUser({ username: 'buyer1' });
    const token = await loginAs(user);

    const r1 = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r1.status).toBe(400);
  });

  it('bỏ qua userEmail từ body — luôn dùng email của user đăng nhập', async () => {
    const user = await createUser({ username: 'buyer-email' });
    const token = await loginAs(user);
    const plan = await createPlan({ code: 'email_lock', price: 99000 });

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'data:image/png;base64,FAKE',
      checkoutUrl: 'https://pay.payos.vn/web/fake-id',
    });

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'email_lock', userEmail: 'victim@attacker.local' });

    expect(res.status).toBe(200);
    const order = await db.query(
      `SELECT user_email, user_id FROM orders WHERE order_code = $1`,
      [res.body.result.orderCode]
    );
    expect(order.rows[0].user_email).toBe(user.email);
    expect(Number(order.rows[0].user_id)).toBe(Number(user.id));
    expect(Number(plan.id)).toBeTruthy();
  });

  it('planCode không tồn tại → 500 (Gói không tồn tại)', async () => {
    const user = await createUser({ username: 'buyer2' });
    const token = await loginAs(user);

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'ghost', userEmail: user.email });

    expect(res.status).toBe(500);
    expect(mockPaymentRequestsCreate).not.toHaveBeenCalled();
  });

  it('plan custom (is_custom=true) không bán public → 500', async () => {
    const user = await createUser({ username: 'buyer3' });
    const token = await loginAs(user);
    await createPlan({ code: 'private', isCustom: true });

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'private', userEmail: user.email });

    expect(res.status).toBe(500);
    expect(mockPaymentRequestsCreate).not.toHaveBeenCalled();
  });

  it('happy path → 200, tạo order pending + gọi PayOS với đúng args', async () => {
    const user = await createUser({ username: 'buyer4' });
    const token = await loginAs(user);
    const plan = await createPlan({ code: 'pro_test', price: 199000 });

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'data:image/png;base64,FAKE',
      checkoutUrl: 'https://pay.payos.vn/web/fake-id',
    });

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'pro_test', userEmail: user.email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result).toMatchObject({
      qrCode: expect.stringContaining('FAKE'),
      checkoutUrl: expect.stringContaining('payos.vn'),
      orderCode: expect.any(Number),
    });

    // PayOS được gọi với đúng amount + orderCode
    expect(mockPaymentRequestsCreate).toHaveBeenCalledTimes(1);
    const payosArgs = mockPaymentRequestsCreate.mock.calls[0][0];
    expect(payosArgs.amount).toBe(199000);
    expect(payosArgs.orderCode).toBe(res.body.result.orderCode);
    expect(payosArgs.description).toMatch(/^TT pro_test/);
    expect(payosArgs.returnUrl).toContain('/payment-success');
    expect(payosArgs.cancelUrl).toContain('/checkout');
    expect(payosArgs.expiredAt).toEqual(expect.any(Number));
    expect(payosArgs.expiredAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Order được persist với status pending + plan_id + user_id
    const order = await db.query(
      `SELECT status, plan_id, amount, user_id, user_email
       FROM orders WHERE order_code = $1`,
      [res.body.result.orderCode]
    );
    expect(order.rows[0]).toMatchObject({
      status: 'pending',
      amount: '199000',
      user_email: user.email,
    });
    expect(Number(order.rows[0].plan_id)).toBe(Number(plan.id));
    expect(Number(order.rows[0].user_id)).toBe(Number(user.id));
  });

  it('PayOS throw lỗi → 500, order vẫn còn pending (không rollback)', async () => {
    const user = await createUser({ username: 'buyer5' });
    const token = await loginAs(user);
    await createPlan({ code: 'std', price: 50000 });

    mockPaymentRequestsCreate.mockRejectedValue(new Error('PayOS down'));

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'std', userEmail: user.email });

    expect(res.status).toBe(500);
    // createOrder chạy trước payos.create → order vẫn tồn tại với pending
    const pending = await db.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE user_email = $1 AND status = 'pending'`,
      [user.email]
    );
    expect(pending.rows[0].n).toBe(1);
  });

  it('voucher usage_limit_per_user=1 → tạo đơn thứ 2 bị từ chối khi còn pending', async () => {
    const user = await createUser({ username: 'voucher-limit' });
    const token = await loginAs(user);
    await createPlan({ code: 'voucher_plan', price: 200000 });
    await db.query(
      `INSERT INTO vouchers (
         code, name, discount_type, discount_value, min_order_amount,
         usage_limit_per_user, auto_apply, is_active
       ) VALUES ('LAUNCH50', 'Launch 50', 'percentage', 50, 0, 1, FALSE, TRUE)`
    );

    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'data:image/png;base64,FAKE',
      checkoutUrl: 'https://pay.payos.vn/web/fake-id',
    });

    const first = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'voucher_plan', voucherCode: 'LAUNCH50' });
    expect(first.status).toBe(200);
    expect(first.body.result.discountAmount).toBe(100000);

    const second = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'voucher_plan', voucherCode: 'LAUNCH50' });
    expect(second.status).toBe(400);
  });

  it('voucher 100% → success ngay, redemption ghi trong cùng luồng', async () => {
    const user = await createUser({ username: 'full-discount' });
    const token = await loginAs(user);
    const plan = await createPlan({ code: 'free_via_voucher', price: 100000 });
    await db.query(
      `INSERT INTO vouchers (
         code, name, discount_type, discount_value, min_order_amount,
         usage_limit_per_user, auto_apply, is_active
       ) VALUES ('FREE100', 'Free 100', 'percentage', 100, 0, 1, FALSE, TRUE)`
    );

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'free_via_voucher', voucherCode: 'FREE100' });

    expect(res.status).toBe(200);
    expect(res.body.result.noPayment).toBe(true);
    expect(mockPaymentRequestsCreate).not.toHaveBeenCalled();

    const order = await db.query(
      `SELECT status, amount, voucher_code FROM orders WHERE order_code = $1`,
      [res.body.result.orderCode]
    );
    expect(order.rows[0].status).toBe('success');
    expect(Number(order.rows[0].amount)).toBe(0);

    const redemption = await db.query(
      `SELECT COUNT(*)::int AS n FROM voucher_redemptions WHERE user_id = $1`,
      [user.id]
    );
    expect(redemption.rows[0].n).toBe(1);

    const u = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [user.id]);
    expect(Number(u.rows[0].active_plan_id)).toBe(Number(plan.id));

    const second = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'free_via_voucher', voucherCode: 'FREE100' });
    expect(second.status).toBe(400);
  });
});

// ===========================================================================
// POST /api/payments/webhook
// ===========================================================================
describe('POST /api/payments/webhook', () => {
  it('webhook verify fail → 500 (PayOS sẽ retry)', async () => {
    mockWebhooksVerify.mockRejectedValue(new Error('Invalid signature'));

    const res = await request(app).post('/api/payments/webhook').send({ bogus: true });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it('code !== "00" → KHÔNG cập nhật order, KHÔNG activate plan', async () => {
    const user = await createUser({ username: 'webhook-fail', status: 'active' });
    const plan = await createPlan({ code: 'p1' });
    const orderCode = Date.now();
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '06', orderCode });

    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);

    const o = await db.query(`SELECT status FROM orders WHERE order_code = $1`, [orderCode]);
    expect(o.rows[0].status).toBe('pending');

    const u = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [user.id]);
    expect(u.rows[0].active_plan_id).toBeNull();
  });

  it('webhook amount mismatch → 200 (dừng retry), đơn failed, không activate', async () => {
    const user = await createUser({ username: 'amt-mismatch' });
    const plan = await createPlan({ code: 'amt-plan', price: 199000 });
    const orderCode = Date.now() + 77;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderCode, plan.id, 199000, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode, amount: 1 });

    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const order = await db.query(`SELECT status, note FROM orders WHERE order_code = $1`, [orderCode]);
    expect(order.rows[0].status).toBe('failed');
    expect(String(order.rows[0].note || '')).toContain('AMOUNT_MISMATCH');

    const u = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [user.id]);
    expect(u.rows[0].active_plan_id).toBeNull();
  });

  it('thanh toán thành công có user_id → order=success, active_plan_id set, expires ≈ now + 1 month', async () => {
    const user = await createUser({ username: 'paid' });
    const plan = await createPlan({ code: 'monthly' });
    const orderCode = Date.now();
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });

    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);

    const o = await db.query(`SELECT status FROM orders WHERE order_code = $1`, [orderCode]);
    expect(o.rows[0].status).toBe('success');

    const u = await db.query(
      `SELECT active_plan_id, subscription_expires_at, subscription_reminder_count
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(Number(u.rows[0].active_plan_id)).toBe(Number(plan.id));
    expect(u.rows[0].subscription_reminder_count).toBe(0);

    // Kiểm tra expires nằm trong khoảng [now + 29d, now + 32d]
    const expires = new Date(u.rows[0].subscription_expires_at).getTime();
    const diffDays = (expires - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(27);
    expect(diffDays).toBeLessThan(33);
  });

  it('order không có user_id nhưng email khớp user → fallback theo email + activate', async () => {
    const user = await createUser({ username: 'fallback' });
    const plan = await createPlan({ code: 'fb' });
    const orderCode = Date.now() + 1;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, NULL, 'pending')`,
      [orderCode, plan.id, plan.price, user.email]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });
    await request(app).post('/api/payments/webhook').send({});

    const u = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [user.id]);
    expect(Number(u.rows[0].active_plan_id)).toBe(Number(plan.id));
  });

  it('order không có user_id và email không khớp user nào → order success NHƯNG không activate', async () => {
    const plan = await createPlan({ code: 'no-user' });
    const orderCode = Date.now() + 2;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, 'ghost@nowhere.local', NULL, 'pending')`,
      [orderCode, plan.id, plan.price]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });
    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);

    const o = await db.query(`SELECT status FROM orders WHERE order_code = $1`, [orderCode]);
    expect(o.rows[0].status).toBe('success');
    // Không có user → không có gì để activate, không throw
  });

  it('đơn đã cancelled bởi admin → webhook code=00 BỎ QUA (không re-activate)', async () => {
    const user = await createUser({ username: 'cancelled-buyer' });
    const plan = await createPlan({ code: 'cancel-test' });
    const orderCode = Date.now() + 3;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'cancelled')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });
    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);

    const o = await db.query(`SELECT status FROM orders WHERE order_code = $1`, [orderCode]);
    expect(o.rows[0].status).toBe('cancelled');

    const u = await db.query(`SELECT active_plan_id FROM users WHERE id = $1`, [user.id]);
    expect(u.rows[0].active_plan_id).toBeNull();
  });

  it('renewal: user đã có subscription còn hạn → expires += 1 month (không mất ngày cũ)', async () => {
    const user = await createUser({ username: 'renew' });
    const plan = await createPlan({ code: 'renew-plan' });

    // Set subscription còn 10 ngày
    const futureDate = new Date(Date.now() + 10 * 24 * 3600 * 1000);
    await db.query(
      `UPDATE users SET subscription_expires_at = $1, active_plan_id = $2 WHERE id = $3`,
      [futureDate, plan.id, user.id]
    );

    const orderCode = Date.now() + 4;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });
    await request(app).post('/api/payments/webhook').send({});

    const u = await db.query(
      `SELECT subscription_expires_at FROM users WHERE id = $1`,
      [user.id]
    );
    const newExpires = new Date(u.rows[0].subscription_expires_at).getTime();
    // Phải xa hơn futureDate (gia hạn từ ngày hết hạn cũ, ~ +30 ngày nữa)
    const extraDays = (newExpires - futureDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(extraDays).toBeGreaterThan(27);
    expect(extraDays).toBeLessThan(33);
  });

  it('subscription_reminder_count được reset về 0 sau khi gia hạn', async () => {
    const user = await createUser({ username: 'remind' });
    const plan = await createPlan({ code: 'remind-plan' });

    await db.query(`UPDATE users SET subscription_reminder_count = 2 WHERE id = $1`, [user.id]);

    const orderCode = Date.now() + 5;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });
    await request(app).post('/api/payments/webhook').send({});

    const u = await db.query(
      `SELECT subscription_reminder_count FROM users WHERE id = $1`,
      [user.id]
    );
    expect(u.rows[0].subscription_reminder_count).toBe(0);
  });

  it('webhook trùng (code=00 2 lần) → chỉ activate 1 lần, không cộng đôi hạn', async () => {
    const user = await createUser({ username: 'dup-webhook' });
    const plan = await createPlan({ code: 'dup-plan' });
    const orderCode = Date.now() + 6;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });

    await request(app).post('/api/payments/webhook').send({});
    const afterFirst = await db.query(
      `SELECT subscription_expires_at, active_plan_id FROM users WHERE id = $1`,
      [user.id]
    );
    const expiresAfterFirst = new Date(afterFirst.rows[0].subscription_expires_at).getTime();

    await request(app).post('/api/payments/webhook').send({});
    const afterSecond = await db.query(
      `SELECT subscription_expires_at, active_plan_id FROM users WHERE id = $1`,
      [user.id]
    );
    const expiresAfterSecond = new Date(afterSecond.rows[0].subscription_expires_at).getTime();

    expect(Number(afterSecond.rows[0].active_plan_id)).toBe(Number(plan.id));
    expect(expiresAfterSecond).toBe(expiresAfterFirst);

    const o = await db.query(`SELECT status FROM orders WHERE order_code = $1`, [orderCode]);
    expect(o.rows[0].status).toBe('success');
  });
});

// ===========================================================================
// GET /api/payments/status/:orderCode
// ===========================================================================
describe('GET /api/payments/status/:orderCode', () => {
  it('cho phép đọc status không auth (PayOS returnUrl) — chỉ trả status', async () => {
    const user = await createUser({ username: 'status-owner' });
    const plan = await createPlan({ code: 'st' });
    const orderCode = Date.now() + 100;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'success')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    const res = await request(app).get(`/api/payments/status/${orderCode}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body).not.toHaveProperty('user_email');
  });

  it('user đăng nhập không phải chủ đơn → 404', async () => {
    const user = await createUser({ username: 'status-owner2' });
    const other = await createUser({ username: 'status-other' });
    const otherToken = await loginAs(other);
    const plan = await createPlan({ code: 'st2' });
    const orderCode = Date.now() + 101;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, $4, $5, 'success')`,
      [orderCode, plan.id, plan.price, user.email, user.id]
    );

    const forbidden = await request(app)
      .get(`/api/payments/status/${orderCode}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(404);
  });

  it('order không tồn tại → 404', async () => {
    const res = await request(app).get('/api/payments/status/999999999999');
    expect(res.status).toBe(404);
  });
});
