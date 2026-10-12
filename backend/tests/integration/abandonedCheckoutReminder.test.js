/**
 * Integration (PostgreSQL thật, SMTP giả ở nodemailer) cho nhắc thanh toán lại đơn gói bỏ dở
 * (PLAN_NHAC_THANH_TOAN_LAI_SAU_2_GIO_2026-10-12 PR-A): truy vấn chọn đơn, dispatcher chuông + thư, đánh dấu đã nhắc,
 * cron_job_runs, và endpoint GET /api/payments/orders/:orderCode/reorder.
 *
 * Mốc thời gian đều TƯƠNG ĐỐI so với "bây giờ" (Date.now()), không ghi cứng ngày.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<test-msg-id>' });
const mockCreateTransport = jest.fn().mockReturnValue({
  verify: jest.fn().mockResolvedValue(true),
  sendMail: mockSendMail,
});

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { recordRun } = await import('../../src/repositories/admin/cronJobRun.repository.js');
const { sendAbandonedCheckoutReminders } = await import('../../src/services/payment/abandonedCheckoutReminder.service.js');
const { clearEventSettingsCache } = await import('../../src/services/notification/notificationDispatch.service.js');
const { truncateAll, createUser, createPlan } = await import('./helpers/db.js');

const HOUR = 3600 * 1000;
const PAYOS_EXPIRED_NOTE = '[OPS] PayOS EXPIRED via cron_reconcile at 2026-10-12T01:00:00.000Z';
const FRONTEND = 'https://founderai.test';

let app;
let origTestSendEmail;
let origFrontendUrl;
let orderSeq = 0;

beforeAll(() => {
  app = createApp();
  origTestSendEmail = process.env.TEST_SEND_EMAIL;
  origFrontendUrl = process.env.FRONTEND_URL;
  process.env.TEST_SEND_EMAIL = '1';
  process.env.FRONTEND_URL = FRONTEND;
});

afterAll(() => {
  if (origTestSendEmail !== undefined) process.env.TEST_SEND_EMAIL = origTestSendEmail;
  else delete process.env.TEST_SEND_EMAIL;
  if (origFrontendUrl !== undefined) process.env.FRONTEND_URL = origFrontendUrl;
  else delete process.env.FRONTEND_URL;
});

beforeEach(async () => {
  await truncateAll();
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: '<test-msg-id>' });
  // truncateAll xoá notification_event_settings → dispatcher dùng MẶC ĐỊNH catalog (order_payment_reminder: chuông + email, khách tắt được email).
  clearEventSettingsCache();
});

async function insertOrder({
  user,
  plan,
  status = 'cancelled',
  note = PAYOS_EXPIRED_NOTE,
  ageHours = 3,
  billingPeriod = 'monthly',
  paymentMethod = 'payos',
  customPlanConfig = null,
  topupConfig = null,
  voucherCode = null,
  discountSource = null,
  amount = 1299000,
}) {
  orderSeq += 1;
  const orderCode = String(1760000000000000 + orderSeq);
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note, billing_period,
                         voucher_code, discount_source, custom_plan_config, topup_config, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14)
     RETURNING id, order_code`,
    [
      orderCode,
      plan ? plan.id : null,
      amount,
      user.email,
      user.id,
      status,
      paymentMethod,
      note,
      billingPeriod,
      voucherCode,
      discountSource,
      customPlanConfig ? JSON.stringify(customPlanConfig) : null,
      topupConfig ? JSON.stringify(topupConfig) : null,
      new Date(Date.now() - ageHours * HOUR),
    ]
  );
  return { id: Number(rows[0].id), orderCode: String(rows[0].order_code) };
}

async function reminderSentAt(orderId) {
  const { rows } = await db.query('SELECT payment_reminder_sent_at FROM orders WHERE id = $1', [orderId]);
  return rows[0].payment_reminder_sent_at;
}

async function bells(userId) {
  const { rows } = await db.query(
    'SELECT event_type, title, link, severity, dedupe_key FROM user_notifications WHERE user_id = $1 ORDER BY id',
    [userId]
  );
  return rows;
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (!res.body?.data?.accessToken) throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function setup() {
  const plan = await createPlan({ code: 'pro-reminder', name: 'Chuyên nghiệp', price: 1299000 });
  const user = await createUser({ username: 'khach-bo-do', email: 'khach-bo-do@example.com', fullName: 'Nguyễn Minh Anh' });
  return { plan, user };
}

describe('sendAbandonedCheckoutReminders — đơn đủ điều kiện', () => {
  it('đơn cancelled "[OPS] PayOS EXPIRED" tạo 3 giờ trước → 1 thư + 1 chuông, ghi payment_reminder_sent_at và dòng cron_job_runs; chạy lại → 0 thư', async () => {
    const { plan, user } = await setup();
    const order = await insertOrder({ user, plan, ageHours: 3 });

    const result = await recordRun('abandoned_checkout_reminder', () => sendAbandonedCheckoutReminders());

    expect(result).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('khach-bo-do@example.com');
    expect(mail.subject).toContain('Hoàn tất thanh toán gói Chuyên nghiệp');
    expect(mail.html).toContain(`href="${FRONTEND}/checkout?order=${order.orderCode}"`);
    expect(mail.html).toContain('Nguyễn Minh Anh');
    expect(mail.html).toContain('1.299.000');

    expect(await bells(user.id)).toEqual([{
      event_type: 'order_payment_reminder',
      title: 'Hoàn tất thanh toán gói Chuyên nghiệp',
      link: `/checkout?order=${order.orderCode}`,
      severity: 'info',
      dedupe_key: `order_payment_reminder:${order.id}`,
    }]);
    expect(await reminderSentAt(order.id)).not.toBeNull();

    const runs = await db.query(
      `SELECT job_code, status, result FROM cron_job_runs WHERE job_code = 'abandoned_checkout_reminder'`
    );
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0].status).toBe('success');
    expect(runs.rows[0].result).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });

    mockSendMail.mockClear();
    const again = await sendAbandonedCheckoutReminders();
    expect(again).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await bells(user.id)).toHaveLength(1);
  });

  it('cửa sổ tuổi đơn: 121 phút và 71 giờ được nhắc; 1 giờ và 4 ngày thì không', async () => {
    const { plan } = await setup();
    const make = async (name, ageHours) => {
      const u = await createUser({ username: name, email: `${name}@example.com` });
      const o = await insertOrder({ user: u, plan, ageHours });
      return { u, o };
    };
    const just2h = await make('tuoi-121-phut', 121 / 60);
    const near72h = await make('tuoi-71-gio', 71);
    const tooNew = await make('tuoi-1-gio', 1);
    const tooOld = await make('tuoi-4-ngay', 96);

    const result = await sendAbandonedCheckoutReminders();

    expect(result.sent).toBe(2);
    expect(await reminderSentAt(just2h.o.id)).not.toBeNull();
    expect(await reminderSentAt(near72h.o.id)).not.toBeNull();
    expect(await reminderSentAt(tooNew.o.id)).toBeNull();
    expect(await reminderSentAt(tooOld.o.id)).toBeNull();
    expect(mockSendMail.mock.calls.map((c) => c[0].to).sort()).toEqual(['tuoi-121-phut@example.com', 'tuoi-71-gio@example.com']);
  });

  it('thư cho kỳ năm hiện đúng nhãn kỳ; mã giảm giá của đơn không chèn vào thư', async () => {
    const { plan, user } = await setup();
    await insertOrder({ user, plan, billingPeriod: 'yearly', voucherCode: 'GIAM20', discountSource: 'public_code', amount: 12470400 });
    await sendAbandonedCheckoutReminders();
    const html = mockSendMail.mock.calls[0][0].html;
    expect(html).toContain('thanh toán theo năm');
    expect(html).toContain('12.470.400');
  });
});

describe('sendAbandonedCheckoutReminders — đơn KHÔNG được nhắc', () => {
  const cases = [
    ['đơn pending (khách có thể đang thanh toán)', { status: 'pending', note: null }],
    ['đơn success', { status: 'success', note: null }],
    ['cancelled bởi admin (không có dấu PayOS)', { note: 'Admin huỷ tay' }],
    ['cancelled vì bị checkout mới thay thế', { note: '[OPS] Replaced by newer checkout attempt' }],
    ['cancelled không có note', { note: null }],
    ['failed do lệch số tiền (tiền có thể đã vào tài khoản)', { status: 'failed', note: '[OPS] AMOUNT_MISMATCH expected=1299000 got=1000 via cron_reconcile' }],
    ['failed kèm dấu PayOS', { status: 'failed', note: '[OPS] PayOS EXPIRED via cron_reconcile' }],
    ['cancelled nhưng webhook báo ĐÃ TRẢ sau đó (PAID_AFTER_CANCELLED)', { note: `${PAYOS_EXPIRED_NOTE}\n[OPS] PAID_AFTER_CANCELLED order status=cancelled` }],
    ['đơn gói tự chọn (custom_plan_config)', { customPlanConfig: { quantities: { chatbots: 2 } } }],
    ['đơn nạp thêm (topup_config)', { topupConfig: { items: [] } }],
    ['đơn thanh toán thủ công (không phải payos)', { paymentMethod: 'manual' }],
  ];

  it.each(cases)('%s', async (_name, overrides) => {
    const { plan, user } = await setup();
    const order = await insertOrder({ user, plan, ...overrides });

    const result = await sendAbandonedCheckoutReminders();

    expect(result).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await bells(user.id)).toEqual([]);
    expect(await reminderSentAt(order.id)).toBeNull();
  });

  it('tài khoản không còn active, hoặc gói đã ngừng bán → không nhắc', async () => {
    const { plan } = await setup();
    const inactiveUser = await createUser({ username: 'tai-khoan-khoa', email: 'khoa@example.com', status: 'inactive' });
    await insertOrder({ user: inactiveUser, plan });
    const retiredPlan = await createPlan({ code: 'ngung-ban', name: 'Gói cũ', price: 500000, isActive: false });
    const okUser = await createUser({ username: 'goi-ngung-ban', email: 'goi-cu@example.com' });
    await insertOrder({ user: okUser, plan: retiredPlan });

    expect(await sendAbandonedCheckoutReminders()).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('khách đã có đơn success SAU đơn bỏ dở (đã mua) → không nhắc; success TRƯỚC đó thì vẫn nhắc', async () => {
    const { plan, user } = await setup();
    const abandoned = await insertOrder({ user, plan, ageHours: 5 });
    await insertOrder({ user, plan, status: 'success', note: null, ageHours: 4 });

    const earlier = await createUser({ username: 'mua-truoc', email: 'mua-truoc@example.com' });
    await insertOrder({ user: earlier, plan, status: 'success', note: null, ageHours: 30 });
    const abandonedLater = await insertOrder({ user: earlier, plan, ageHours: 5 });

    const result = await sendAbandonedCheckoutReminders();

    expect(result.sent).toBe(1);
    expect(await reminderSentAt(abandoned.id)).toBeNull();
    expect(await reminderSentAt(abandonedLater.id)).not.toBeNull();
    expect(mockSendMail.mock.calls.map((c) => c[0].to)).toEqual(['mua-truoc@example.com']);
  });

  it('khách đang có đơn pending mới hơn (đang thanh toán) → chưa nhắc đơn cũ', async () => {
    const { plan, user } = await setup();
    const old = await insertOrder({ user, plan, ageHours: 5 });
    await insertOrder({ user, plan, status: 'pending', note: null, ageHours: 0.1 });

    expect(await sendAbandonedCheckoutReminders()).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await reminderSentAt(old.id)).toBeNull();
  });

  it('hai lần bỏ dở trong cùng một lượt chần chừ: chỉ đơn MỚI NHẤT được nhắc, một thư duy nhất — kể cả khi đơn mới chưa đủ 2 giờ', async () => {
    const { plan, user } = await setup();
    const older = await insertOrder({ user, plan, ageHours: 5 });
    const newerNotYet = await insertOrder({ user, plan, ageHours: 1 });

    // Đơn mới 1 giờ (chưa đến hạn): đơn cũ phải nhường, không nhắc trước.
    expect(await sendAbandonedCheckoutReminders()).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(await reminderSentAt(older.id)).toBeNull();

    // Đơn mới đủ 3 giờ → cả hai đủ tuổi, chỉ đơn mới nhất được nhắc.
    await db.query(`UPDATE orders SET created_at = NOW() - INTERVAL '3 hours' WHERE id = $1`, [newerNotYet.id]);
    const result = await sendAbandonedCheckoutReminders();
    expect(result.sent).toBe(1);
    expect(await reminderSentAt(newerNotYet.id)).not.toBeNull();
    expect(await reminderSentAt(older.id)).toBeNull();
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    // Lượt sau: đơn cũ vẫn không được nhắc (đã có đơn mới hơn đã nhắc).
    expect(await sendAbandonedCheckoutReminders()).toEqual({ scanned: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe('sendAbandonedCheckoutReminders — kênh gửi', () => {
  it('khách tắt email sự kiện order_payment_reminder → chỉ chuông, KHÔNG thư, vẫn đánh dấu đã nhắc', async () => {
    const { plan, user } = await setup();
    await db.query(
      `INSERT INTO notification_preferences (user_id, event_type, email_enabled) VALUES ($1, 'order_payment_reminder', false)`,
      [user.id]
    );
    const order = await insertOrder({ user, plan });

    const result = await sendAbandonedCheckoutReminders();

    expect(result).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(await bells(user.id)).toHaveLength(1);
    expect(await reminderSentAt(order.id)).not.toBeNull();
  });

  it('SMTP lỗi nhưng chuông ghi được → vẫn đánh dấu đã nhắc, lượt sau KHÔNG gửi lại thư', async () => {
    const { plan, user } = await setup();
    mockSendMail.mockRejectedValue(new Error('SMTP down'));
    const order = await insertOrder({ user, plan });

    const first = await sendAbandonedCheckoutReminders();
    expect(first).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
    expect(await bells(user.id)).toHaveLength(1);
    expect(await reminderSentAt(order.id)).not.toBeNull();

    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: '<ok>' });
    await sendAbandonedCheckoutReminders();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('hỏng hoàn toàn (admin tắt chuông + SMTP lỗi) → KHÔNG đánh dấu; SMTP hồi phục thì lượt sau gửi và đánh dấu', async () => {
    const { plan, user } = await setup();
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ('order_payment_reminder', false, true, true)`
    );
    clearEventSettingsCache();
    mockSendMail.mockRejectedValue(new Error('SMTP down'));
    const order = await insertOrder({ user, plan });

    const failed = await sendAbandonedCheckoutReminders();
    expect(failed).toEqual({ scanned: 1, sent: 0, skipped: 0, failed: 1 });
    expect(await reminderSentAt(order.id)).toBeNull();
    expect(await bells(user.id)).toEqual([]);

    mockSendMail.mockReset();
    mockSendMail.mockResolvedValue({ messageId: '<ok>' });
    const retry = await sendAbandonedCheckoutReminders();
    expect(retry).toEqual({ scanned: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(await reminderSentAt(order.id)).not.toBeNull();
  });

  it('super admin đã sửa mẫu thư (khoá order_payment_reminder trong system_email_templates) → thư dùng mẫu đó', async () => {
    const { plan, user } = await setup();
    await db.query(
      `INSERT INTO system_email_templates (template_key, subject, body_html)
       VALUES ('order_payment_reminder', 'Đừng bỏ lỡ gói {{plan_name}}', '<p>Chào {{user_name}}, mở {{pay_url}} (đơn {{order_code}})</p>')`
    );
    const order = await insertOrder({ user, plan });

    await sendAbandonedCheckoutReminders();

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Đừng bỏ lỡ gói Chuyên nghiệp');
    expect(mail.html).toContain(`Chào Nguyễn Minh Anh, mở ${FRONTEND}/checkout?order=${order.orderCode} (đơn ${order.orderCode})`);
  });
});

describe('GET /api/payments/orders/:orderCode/reorder', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/payments/orders/123/reorder');
    expect(res.status).toBe(401);
  });

  it('chủ đơn → 200 đúng plan.code / billingPeriod / voucherCode (mã khách tự nhập) / orderStatus', async () => {
    const { plan, user } = await setup();
    await db.query('UPDATE plans SET price_yearly = 12470400 WHERE id = $1', [plan.id]);
    const order = await insertOrder({ user, plan, billingPeriod: 'yearly', voucherCode: 'GIAM20', discountSource: 'public_code' });
    const token = await loginAs(user);

    const res = await request(app).get(`/api/payments/orders/${order.orderCode}/reorder`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.result).toMatchObject({
      billingPeriod: 'yearly',
      voucherCode: 'GIAM20',
      orderStatus: 'cancelled',
    });
    expect(res.body.result.plan).toMatchObject({ code: 'pro-reminder', name: 'Chuyên nghiệp' });
    expect(Number(res.body.result.plan.price)).toBe(1299000);
    expect(Number(res.body.result.plan.price_yearly)).toBe(12470400);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('khuyến mãi tự động của đơn cũ (discount_source=automatic) KHÔNG được trả về như mã khách nhập', async () => {
    const { plan, user } = await setup();
    const order = await insertOrder({ user, plan, voucherCode: 'AUTO10', discountSource: 'automatic' });
    const token = await loginAs(user);
    const res = await request(app).get(`/api/payments/orders/${order.orderCode}/reorder`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.result.voucherCode).toBeNull();
  });

  it('người khác hỏi mã đơn của chủ đơn → 404 (không lộ mã có thật); mã không tồn tại / không phải số → 404', async () => {
    const { plan, user } = await setup();
    const stranger = await createUser({ username: 'nguoi-la', email: 'nguoi-la@example.com' });
    const order = await insertOrder({ user, plan });
    const token = await loginAs(stranger);
    const auth = { Authorization: `Bearer ${token}` };

    const other = await request(app).get(`/api/payments/orders/${order.orderCode}/reorder`).set(auth);
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('ORDER_NOT_FOUND');
    expect(other.body.result).toBeUndefined();

    expect((await request(app).get('/api/payments/orders/999999/reorder').set(auth)).status).toBe(404);
    expect((await request(app).get('/api/payments/orders/abc/reorder').set(auth)).status).toBe(404);
  });

  it('đơn đã success → 409 ORDER_ALREADY_PAID', async () => {
    const { plan, user } = await setup();
    const order = await insertOrder({ user, plan, status: 'success', note: null });
    const token = await loginAs(user);
    const res = await request(app).get(`/api/payments/orders/${order.orderCode}/reorder`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_ALREADY_PAID');
  });

  it('gói không còn bán → 410 PLAN_UNAVAILABLE; đơn gói tự chọn → 422 ORDER_NOT_REORDERABLE', async () => {
    const { plan, user } = await setup();
    const order = await insertOrder({ user, plan });
    const custom = await insertOrder({ user, plan, customPlanConfig: { quantities: { chatbots: 1 } } });
    await db.query('UPDATE plans SET is_active = FALSE WHERE id = $1', [plan.id]);
    const token = await loginAs(user);
    const auth = { Authorization: `Bearer ${token}` };

    const gone = await request(app).get(`/api/payments/orders/${order.orderCode}/reorder`).set(auth);
    expect(gone.status).toBe(410);
    expect(gone.body.code).toBe('PLAN_UNAVAILABLE');

    const notReorderable = await request(app).get(`/api/payments/orders/${custom.orderCode}/reorder`).set(auth);
    expect(notReorderable.status).toBe(422);
    expect(notReorderable.body.code).toBe('ORDER_NOT_REORDERABLE');
  });
});
