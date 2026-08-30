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
const { findActiveBillingPeriod } = await import('../../src/repositories/user/user.repository.js');
const { claimOrderSuccess } = await import('../../src/repositories/payment/payment.repository.js');
const { fulfillPaidOrder } = await import('../../src/services/payment/payosOrderFulfillment.service.js');

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

async function insertVoucher({
  code,
  name = code,
  offerMode = 'public_code',
  discountValue = 10,
  planCodes = null,
  startsAt = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO vouchers (
       code, name, discount_type, discount_value, min_order_amount,
       applies_to_plan_codes, applies_to_billing_periods, starts_at, ends_at,
       auto_apply, offer_mode, is_active
     ) VALUES ($1, $2, 'percentage', $3, 0, $4, ARRAY['monthly', 'yearly'], $5,
       NOW() + INTERVAL '60 days', $6, $7, TRUE)
     RETURNING *`,
    [
      code,
      name,
      discountValue,
      planCodes,
      startsAt,
      offerMode === 'automatic',
      offerMode,
    ]
  );
  return rows[0];
}

async function waitForDatabaseLock(processId, attempts = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { rows } = await db.query(
      `SELECT 1
       FROM pg_stat_activity
       WHERE pid = $1 AND wait_event_type = 'Lock'
       LIMIT 1`,
      [processId]
    );
    if (rows.length) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for PostgreSQL lock on backend process ${processId}`);
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
    expect(payosArgs.description).toBe('FOUNDERAI PRO_TEST');
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
      user_email: user.email,
    });
    // So bằng Number, KHÔNG so chuỗi.
    //
    // orders.amount trên production là numeric(12,2) nên pg trả "199000.00";
    // bootstrap trước đây khai BIGINT nên trả "199000". Bài test cũ chỉ xanh vì
    // hai schema lệch nhau — nó SAI với production suốt từ đầu. Sau khi bootstrap
    // được sửa cho khớp (PLAN_SCHEMA_BUOC2 Loại C), lệch này lộ ra.
    //
    // Code thật cũng so bằng Number (payment.service.js, payosReconcile.service.js),
    // nên so kiểu này khớp với hành vi thật và miễn nhiễm với định dạng chuỗi.
    expect(Number(order.rows[0].amount)).toBe(199000);
    expect(Number(order.rows[0].plan_id)).toBe(Number(plan.id));
    expect(Number(order.rows[0].user_id)).toBe(Number(user.id));
  });

  it('không có explicit code thì backend tự áp automatic và snapshot không lộ code', async () => {
    const user = await createUser({ username: 'auto-payment' });
    const token = await loginAs(user);
    await createPlan({ code: 'auto_plan', price: 200000 });
    await insertVoucher({
      code: 'AUTO_PAYMENT20',
      name: 'Automatic 20%',
      offerMode: 'automatic',
      discountValue: 20,
      planCodes: ['auto_plan'],
    });
    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'data:image/png;base64,FAKE',
      checkoutUrl: 'https://pay.payos.vn/web/fake-id',
    });

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'auto_plan' });

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      originalAmount: 200000,
      discountAmount: 40000,
      amount: 160000,
      discount: {
        source: 'automatic',
        name: 'Automatic 20%',
        code: null,
        finalAmount: 160000,
      },
    });
    expect(mockPaymentRequestsCreate.mock.calls[0][0].amount).toBe(160000);
    const order = await db.query(
      `SELECT amount, voucher_code, discount_source, discount_label
       FROM orders WHERE order_code = $1`,
      [res.body.result.orderCode]
    );
    expect(Number(order.rows[0].amount)).toBe(160000);
    expect(order.rows[0].voucher_code).toBeNull();
    expect(order.rows[0].discount_source).toBe('automatic');
    expect(order.rows[0].discount_label).toBe('Automatic 20%');
  });

  it('explicit private code thắng automatic và invalid explicit không fallback', async () => {
    const user = await createUser({ username: 'private-payment' });
    const token = await loginAs(user);
    await createPlan({ code: 'private_plan', price: 200000 });
    await insertVoucher({
      code: 'AUTO_PRIVATE30',
      name: 'Automatic 30%',
      offerMode: 'automatic',
      discountValue: 30,
      planCodes: ['private_plan'],
    });
    await insertVoucher({
      code: 'HIDDEN10',
      name: 'Private 10%',
      offerMode: 'private_code',
      discountValue: 10,
      planCodes: ['private_plan'],
    });
    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'data:image/png;base64,FAKE',
      checkoutUrl: 'https://pay.payos.vn/web/fake-id',
    });

    const explicit = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'private_plan', explicitVoucherCode: 'HIDDEN10' });
    expect(explicit.status).toBe(200);
    expect(explicit.body.result).toMatchObject({
      discountAmount: 20000,
      amount: 180000,
      discount: { source: 'private_code', code: 'HIDDEN10' },
    });

    mockPaymentRequestsCreate.mockClear();
    const invalid = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'private_plan', explicitVoucherCode: 'NOTVALID' });
    expect(invalid.status).toBe(400);
    expect(mockPaymentRequestsCreate).not.toHaveBeenCalled();
  });

  it('legacy voucherCode automatic chỉ là hint, không ép chọn promotion yếu hơn', async () => {
    const user = await createUser({ username: 'legacy-auto-hint' });
    const token = await loginAs(user);
    await createPlan({ code: 'legacy_hint_plan', price: 100000 });
    await insertVoucher({
      code: 'AUTO_WEAK10',
      name: 'Weak 10%',
      offerMode: 'automatic',
      discountValue: 10,
      planCodes: ['legacy_hint_plan'],
      startsAt: '2026-01-01T00:00:00Z',
    });
    await insertVoucher({
      code: 'AUTO_BEST20',
      name: 'Best 20%',
      offerMode: 'automatic',
      discountValue: 20,
      planCodes: ['legacy_hint_plan'],
      startsAt: '2026-02-01T00:00:00Z',
    });
    mockPaymentRequestsCreate.mockResolvedValue({
      qrCode: 'data:image/png;base64,FAKE',
      checkoutUrl: 'https://pay.payos.vn/web/fake-id',
    });

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'legacy_hint_plan', voucherCode: 'AUTO_WEAK10' });

    expect(res.status).toBe(200);
    expect(res.body.result.discount).toMatchObject({
      source: 'automatic',
      name: 'Best 20%',
      code: null,
    });
    expect(res.body.result.amount).toBe(80000);
  });

  it('PayOS throw lỗi → 502 và KHÔNG để lại đơn pending mồ côi', async () => {
    // Trước đây đơn được commit trước khi gọi PayOS, lỗi là để lại đơn `pending`
    // không bao giờ có link — nguồn của 6 đơn mồ côi trong dữ liệu tháng 5/2026.
    // Nay xoá đơn khi create thất bại, giống đường top-up và gói tự chọn.
    const user = await createUser({ username: 'buyer5' });
    const token = await loginAs(user);
    await createPlan({ code: 'std', price: 50000 });

    mockPaymentRequestsCreate.mockRejectedValue(new Error('PayOS down'));

    const res = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'std', userEmail: user.email });

    // 502 = lỗi từ dịch vụ bên ngoài, không phải lỗi nội bộ của mình
    expect(res.status).toBe(502);

    const pending = await db.query(
      `SELECT COUNT(*)::int AS n FROM orders WHERE user_email = $1 AND status = 'pending'`,
      [user.email]
    );
    expect(pending.rows[0].n).toBe(0);
  });

  it('voucher usage_limit_per_user=1 → đơn thứ 2 huỷ đơn cũ rồi tạo mới, chỉ còn 1 pending', async () => {
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

    // Trước đây guard voucher chặn đơn thứ 2 (400) khi còn đơn pending.
    // Nay luật chống trùng huỷ đơn cũ trước, nên đơn thứ 2 đi qua — và đó là
    // hành vi mong muốn: người dùng bấm lại được thay vì bị chặn cụt, mà vẫn
    // chỉ còn đúng MỘT đơn sống. Voucher chỉ thực sự tiêu ở redeemVoucherForOrder
    // khi thanh toán thành công, nên giới hạn 1 lần/người vẫn nguyên vẹn.
    const second = await request(app)
      .post('/api/payments/create-payment')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'voucher_plan', voucherCode: 'LAUNCH50' });
    expect(second.status).toBe(200);
    expect(second.body.result.discountAmount).toBe(100000);

    // Điểm mấu chốt: đơn cũ đã bị huỷ, không tồn tại hai đơn pending song song
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS n FROM orders
       WHERE user_email = $1 GROUP BY status ORDER BY status`,
      [user.email]
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    expect(byStatus.pending).toBe(1);
    expect(byStatus.cancelled).toBe(1);
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
    expect(second.status).toBe(409);
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
    const user = await createUser({ username: 'webhook-fail', status: 'active', withPlan: false });
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
    const user = await createUser({ username: 'amt-mismatch', withPlan: false });
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
    const user = await createUser({ username: 'paid', withPlan: false });
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
      `SELECT active_plan_id, subscription_expires_at, plan_activated_at, subscription_reminder_count
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(Number(u.rows[0].active_plan_id)).toBe(Number(plan.id));
    expect(u.rows[0].plan_activated_at).not.toBeNull();
    expect(u.rows[0].subscription_reminder_count).toBe(0);

    // Kiểm tra expires nằm trong khoảng [now + 29d, now + 32d]
    const expires = new Date(u.rows[0].subscription_expires_at).getTime();
    const diffDays = (expires - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(27);
    expect(diffDays).toBeLessThan(33);
  });

  it('webhook của đơn cũ đến sau không được hạ gói của đơn mới đã thanh toán', async () => {
    const user = await createUser({ username: 'out-of-order-paid-plan', withPlan: false });
    const starter = await createPlan({ code: 'out-of-order-starter', price: 299000 });
    const professional = await createPlan({ code: 'out-of-order-pro', price: 1299000 });
    const olderOrderCode = Date.now() + 200;
    const newerOrderCode = olderOrderCode + 1;

    // Checkout Starter is created first, then the customer changes their mind
    // and creates Pro. PayOS is allowed to deliver these webhooks in either order.
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'yearly')`,
      [olderOrderCode, starter.id, starter.price, user.email, user.id]
    );
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'yearly')`,
      [newerOrderCode, professional.id, professional.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: newerOrderCode });
    await request(app).post('/api/payments/webhook').send({});

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: olderOrderCode });
    await request(app).post('/api/payments/webhook').send({});

    const { rows: userRows } = await db.query(
      `SELECT active_plan_id, subscription_expires_at
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(Number(userRows[0].active_plan_id)).toBe(Number(professional.id));
    const daysRemaining = (new Date(userRows[0].subscription_expires_at).getTime() - Date.now())
      / (1000 * 60 * 60 * 24);
    expect(daysRemaining).toBeGreaterThan(360);

    const { rows: orderRows } = await db.query(
      `SELECT order_code, status FROM orders
       WHERE order_code IN ($1, $2)
       ORDER BY order_code`,
      [olderOrderCode, newerOrderCode]
    );
    expect(orderRows).toEqual([
      { order_code: String(olderOrderCode), status: 'success' },
      { order_code: String(newerOrderCode), status: 'success' },
    ]);
  });

  it('concurrent direct fulfillment reads the newer checkout after waiting on the entitlement lock', async () => {
    const user = await createUser({ username: 'concurrent-out-of-order-plan', withPlan: false });
    const starter = await createPlan({ code: 'concurrent-out-of-order-starter', price: 299000 });
    const professional = await createPlan({ code: 'concurrent-out-of-order-pro', price: 1299000 });
    const olderOrderCode = Date.now() + 205;
    const newerOrderCode = olderOrderCode + 1;

    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'yearly')`,
      [olderOrderCode, starter.id, starter.price, user.email, user.id]
    );
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'yearly')`,
      [newerOrderCode, professional.id, professional.price, user.email, user.id]
    );

    const newerClient = await db.getClient();
    const olderClient = await db.getClient();
    let newerCommitted = false;
    let olderCommitted = false;
    try {
      await newerClient.query('BEGIN');
      const newerOrder = await claimOrderSuccess(newerOrderCode, newerClient);
      await fulfillPaidOrder(newerOrder, newerClient);

      await olderClient.query('BEGIN');
      const olderOrder = await claimOrderSuccess(olderOrderCode, olderClient);
      const olderFulfillment = fulfillPaidOrder(olderOrder, olderClient);

      // Proves that the older worker started its lock statement before the
      // newer transaction commits. The old combined lock+LATERAL query failed
      // precisely in this arrangement because its snapshot was already stale.
      await waitForDatabaseLock(olderClient.processID);
      await newerClient.query('COMMIT');
      newerCommitted = true;

      await olderFulfillment;
      await olderClient.query('COMMIT');
      olderCommitted = true;
    } finally {
      if (!olderCommitted) await olderClient.query('ROLLBACK').catch(() => {});
      if (!newerCommitted) await newerClient.query('ROLLBACK').catch(() => {});
      olderClient.release();
      newerClient.release();
    }

    const { rows } = await db.query('SELECT active_plan_id FROM users WHERE id = $1', [user.id]);
    expect(Number(rows[0].active_plan_id)).toBe(Number(professional.id));
  });

  it('webhook direct cũ đến sau không được ghi đè scheduled change mới đã kích hoạt', async () => {
    const user = await createUser({ username: 'late-direct-after-scheduled', withPlan: false });
    const starter = await createPlan({ code: 'late-direct-starter', price: 299000 });
    const professional = await createPlan({ code: 'late-direct-scheduled-pro', price: 1299000 });
    const olderOrderCode = Date.now() + 210;
    const scheduledOrderCode = olderOrderCode + 1;

    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'monthly')`,
      [olderOrderCode, starter.id, starter.price, user.email, user.id]
    );
    const { rows: scheduledOrderRows } = await db.query(
      `INSERT INTO orders (
         order_code, plan_id, amount, user_email, user_id, status, payment_method,
         billing_period, note, paid_at
       ) VALUES ($1, $2, $3, $4, $5, 'success', 'payos', 'yearly', 'scheduled_change', NOW())
       RETURNING id`,
      [scheduledOrderCode, professional.id, professional.price, user.email, user.id]
    );
    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, order_id, amount_paid, status,
         activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', $3, $4, 'activated', NOW(), NOW())`,
      [user.id, professional.id, scheduledOrderRows[0].id, professional.price]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = NOW() + INTERVAL '12 months',
           plan_activated_at = NOW()
       WHERE id = $2`,
      [professional.id, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: olderOrderCode });
    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(200);

    const { rows: userRows } = await db.query(
      'SELECT active_plan_id FROM users WHERE id = $1',
      [user.id]
    );
    expect(Number(userRows[0].active_plan_id)).toBe(Number(professional.id));
  });

  it('webhook đơn tháng cũ đến sau vẫn giữ kỳ năm của checkout mới cùng gói', async () => {
    const user = await createUser({ username: 'out-of-order-same-plan', withPlan: false });
    const starter = await createPlan({ code: 'out-of-order-same-plan-starter', price: 299000 });
    const olderOrderCode = Date.now() + 220;
    const newerOrderCode = olderOrderCode + 1;

    // The two checkouts use the same plan, so active_plan_id alone cannot
    // distinguish them. The newer yearly checkout is paid first; the older
    // monthly callback arrives later and must not become the displayed cycle.
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'monthly')`,
      [olderOrderCode, starter.id, starter.price, user.email, user.id]
    );
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'yearly')`,
      [newerOrderCode, starter.id, starter.price, user.email, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: newerOrderCode });
    await request(app).post('/api/payments/webhook').send({});

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: olderOrderCode });
    await request(app).post('/api/payments/webhook').send({});

    const { rows: userRows } = await db.query(
      `SELECT active_plan_id, subscription_expires_at
       FROM users WHERE id = $1`,
      [user.id]
    );
    expect(Number(userRows[0].active_plan_id)).toBe(Number(starter.id));
    const daysRemaining = (new Date(userRows[0].subscription_expires_at).getTime() - Date.now())
      / (1000 * 60 * 60 * 24);
    expect(daysRemaining).toBeGreaterThan(360);

    await expect(findActiveBillingPeriod(user.id, user.email, db)).resolves.toBe('yearly');
  });

  it('resolver giữ kỳ năm của scheduled checkout khi direct monthly callback cũ đến muộn', async () => {
    const user = await createUser({ username: 'late-direct-same-plan-scheduled', withPlan: false });
    const starter = await createPlan({ code: 'late-direct-same-plan-scheduled', price: 299000 });
    const olderOrderCode = Date.now() + 230;
    const scheduledOrderCode = olderOrderCode + 1;

    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, billing_period)
       VALUES ($1, $2, $3, $4, $5, 'pending', 'monthly')`,
      [olderOrderCode, starter.id, starter.price, user.email, user.id]
    );
    const { rows: scheduledOrderRows } = await db.query(
      `INSERT INTO orders (
         order_code, plan_id, amount, user_email, user_id, status, payment_method,
         billing_period, note, paid_at
       ) VALUES ($1, $2, $3, $4, $5, 'success', 'payos', 'yearly', 'scheduled_change', NOW())
       RETURNING id`,
      [scheduledOrderCode, starter.id, starter.price, user.email, user.id]
    );
    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, order_id, amount_paid, status,
         activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', $3, $4, 'activated', NOW(), NOW())`,
      [user.id, starter.id, scheduledOrderRows[0].id, starter.price]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = NOW() + INTERVAL '12 months',
           plan_activated_at = NOW()
       WHERE id = $2`,
      [starter.id, user.id]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode: olderOrderCode });
    await expect(request(app).post('/api/payments/webhook').send({})).resolves.toMatchObject({ status: 200 });

    await expect(findActiveBillingPeriod(user.id, user.email, db)).resolves.toBe('yearly');
  });

  it('resolver lets a direct renewal created after an unlinked legacy schedule win', async () => {
    const user = await createUser({ username: 'legacy-scheduled-later-direct', withPlan: false });
    const starter = await createPlan({ code: 'legacy-scheduled-later-direct', price: 299000 });
    const legacyActivatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const directCreatedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const directOrderCode = Date.now() + 240;

    // Old scheduled rows could be activated without retaining their source
    // order. The direct renewal is demonstrably newer because its checkout was
    // created after the schedule activated.
    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, amount_paid, status, activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', $3, 'activated', $4, $4)`,
      [user.id, starter.id, starter.price, legacyActivatedAt]
    );
    await db.query(
      `INSERT INTO orders (
         order_code, plan_id, amount, user_email, user_id, status, payment_method,
         billing_period, paid_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'success', 'payos', 'monthly', $6, $6)`,
      [directOrderCode, starter.id, starter.price, user.email, user.id, directCreatedAt]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = NOW() + INTERVAL '30 days',
           plan_activated_at = $2
       WHERE id = $3`,
      [starter.id, directCreatedAt, user.id]
    );

    await expect(findActiveBillingPeriod(user.id, user.email, db)).resolves.toBe('monthly');
  });

  it('resolver keeps an unlinked legacy schedule over a delayed older direct callback', async () => {
    const user = await createUser({ username: 'legacy-scheduled-late-callback', withPlan: false });
    const starter = await createPlan({ code: 'legacy-scheduled-late-callback', price: 299000 });
    const directCreatedAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const legacyActivatedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const directOrderCode = Date.now() + 250;

    // paid_at is deliberately later than the schedule, reproducing an old
    // PayOS callback. created_at remains the reliable checkout-intent time.
    await db.query(
      `INSERT INTO orders (
         order_code, plan_id, amount, user_email, user_id, status, payment_method,
         billing_period, paid_at, created_at
       ) VALUES ($1, $2, $3, $4, $5, 'success', 'payos', 'monthly', NOW(), $6)`,
      [directOrderCode, starter.id, starter.price, user.email, user.id, directCreatedAt]
    );
    await db.query(
      `INSERT INTO scheduled_plan_changes (
         user_id, plan_id, billing_period, amount_paid, status, activate_after, activated_at
       ) VALUES ($1, $2, 'yearly', $3, 'activated', $4, $4)`,
      [user.id, starter.id, starter.price, legacyActivatedAt]
    );
    await db.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = NOW() + INTERVAL '12 months',
           plan_activated_at = $2
       WHERE id = $3`,
      [starter.id, legacyActivatedAt, user.id]
    );

    await expect(findActiveBillingPeriod(user.id, user.email, db)).resolves.toBe('yearly');
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

  it('order không có user_id và email không khớp user nào → rollback, giữ pending để PayOS retry/OPS xử lý', async () => {
    const plan = await createPlan({ code: 'no-user' });
    const orderCode = Date.now() + 2;
    await db.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
       VALUES ($1, $2, $3, 'ghost@nowhere.local', NULL, 'pending')`,
      [orderCode, plan.id, plan.price]
    );

    mockWebhooksVerify.mockResolvedValue({ code: '00', orderCode });
    const res = await request(app).post('/api/payments/webhook').send({});
    expect(res.status).toBe(500);

    const o = await db.query(`SELECT status FROM orders WHERE order_code = $1`, [orderCode]);
    expect(o.rows[0].status).toBe('pending');
    // Không được ghi nhận thanh toán thành công nếu không xác định được account
    // nhận entitlement; retry webhook hoặc OPS cần gắn user_id đúng trước.
  });

  it('đơn đã cancelled bởi admin → webhook code=00 BỎ QUA (không re-activate)', async () => {
    const user = await createUser({ username: 'cancelled-buyer', withPlan: false });
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

  it('kích hoạt/nâng gói ghi đè subscription_expires_at = NOW() + 30 ngày (không cộng dồn ngày cũ)', async () => {
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
    // Tính lại từ hôm nay (~ +30 ngày từ NOW, ghi đè 10 ngày cũ)
    const daysFromNow = (newExpires - Date.now()) / (1000 * 60 * 60 * 24);
    expect(daysFromNow).toBeGreaterThan(28);
    expect(daysFromNow).toBeLessThan(32);
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
