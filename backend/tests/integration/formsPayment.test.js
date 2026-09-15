/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-3a — backend thanh toán giữ chỗ.
 *
 * Cùng quy ước với tests/integration/formsBooking.test.js: không dùng ngày cố định, tính
 * ngày tương lai từ todayVn(new Date()); khai đủ 7 thứ trong weeklySlots để ngày nào cũng
 * có khung.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<sys@test>' });
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
const { truncateAll, createUser } = await import('./helpers/db.js');
const { todayVn, addDaysToDateStr } = await import('../../src/utils/formBooking.util.js');
const { runFormBookingReminder } = await import('../../src/services/formBookingReminder.service.js');

let app;

beforeAll(() => {
  process.env.TEST_SEND_EMAIL = '1';
  app = createApp();
});

afterAll(() => {
  delete process.env.TEST_SEND_EMAIL;
});

beforeEach(async () => {
  mockSendMail.mockClear();
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function addEmployeeMembership(ownerId, employeeId, permissions = {}) {
  await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status)
     VALUES ($1, $2, $3::jsonb, 'active')`,
    [ownerId, employeeId, JSON.stringify(permissions)]
  );
}

const ALL_WEEK_TIME = '23:00';
function allWeekSlots(time = ALL_WEEK_TIME) {
  return { 0: [time], 1: [time], 2: [time], 3: [time], 4: [time], 5: [time], 6: [time] };
}
function futureDate(daysFromNow) {
  return addDaysToDateStr(todayVn(new Date()), daysFromNow);
}

const VALID_PAYMENT_CONFIG = {
  enabled: true,
  method: 'bank',
  amount: 150000,
  bankBin: '970422',
  accountNumber: '0123456789',
  accountName: 'nguyễn văn a',
  holdMinutes: 30,
};

/**
 * Tạo + xuất bản một form. `paymentConfig`/`bookingConfig` truyền qua `overrides`.
 */
async function createPublishedForm(token, overrides = {}) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Form Thanh Toán Test',
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
      settings: { sendConfirmation: true },
      ...overrides,
    });
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;
  const publishRes = await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  expect(publishRes.status).toBe(200);
  return publishRes.body.data;
}

async function setHoldExpiresAtPast(submissionId) {
  await db.query(
    `UPDATE form_submissions SET hold_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
    [submissionId]
  );
}

describe('PR-3a — paymentConfig: chỉ chủ workspace, chốt method, audit log', () => {
  it('nhân viên (activeContext employee, có quyền forms) PUT paymentConfig → 403 PAYMENT_CONFIG_OWNER_ONLY', async () => {
    const owner = await createUser({ username: 'owner_pay_emp' });
    const employee = await createUser({ username: 'employee_pay' });
    await addEmployeeMembership(owner.id, employee.id, { forms: true });
    const ownerToken = await loginAs(owner);
    const employeeToken = await loginAs(employee);

    const form = await createPublishedForm(ownerToken);

    const res = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ paymentConfig: VALID_PAYMENT_CONFIG });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PAYMENT_CONFIG_OWNER_ONLY');

    const dbRow = await db.query(`SELECT payment_config FROM forms WHERE id = $1`, [form.id]);
    expect(dbRow.rows[0].payment_config).toBeNull();
  });

  it('chủ workspace PUT paymentConfig → 200, lưu đúng, ghi audit log (STK CHỈ 4 số cuối, không đủ số)', async () => {
    const owner = await createUser({ username: 'owner_pay_self' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token);

    const res = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentConfig: VALID_PAYMENT_CONFIG });

    expect(res.status).toBe(200);
    expect(res.body.data.paymentConfig).toEqual({
      enabled: true,
      method: 'bank',
      amount: 150000,
      bankBin: '970422',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
      holdMinutes: 30,
    });

    const auditRows = await db.query(
      `SELECT details FROM audit_logs WHERE action = 'FORM_PAYMENT_CONFIG_UPDATED' AND entity_id = $1`,
      [form.id]
    );
    expect(auditRows.rows).toHaveLength(1);
    const details = auditRows.rows[0].details;
    expect(details.bankBin).toBe('970422');
    expect(details.accountNumberLast4).toBe('6789');
    expect(JSON.stringify(details)).not.toContain('0123456789');
  });

  it('method: "momo_image" → 400 (PR-3a chỉ nhận bank, momo dời sau PR-4)', async () => {
    const owner = await createUser({ username: 'owner_pay_momo' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token);

    const res = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentConfig: { ...VALID_PAYMENT_CONFIG, method: 'momo_image' } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PAYMENT_METHOD_UNSUPPORTED');
  });
});

describe('PR-3a — nộp bài form thu tiền', () => {
  it('form chỉ thu tiền (không đặt lịch) → 201, pending_payment, payment.qrString hợp lệ, payment_snapshot đúng tại lúc đặt', async () => {
    const owner = await createUser({ username: 'owner_pay_submit' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const emailField = form.fields[0];

    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'payer@example.com' } });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeTruthy();
    const payment = res.body.data.payment;
    expect(payment.amount).toBe(150000);
    expect(payment.bankBin).toBe('970422');
    expect(payment.bankName).toBe('MB Bank');
    expect(payment.accountNumber).toBe('0123456789');
    expect(payment.accountName).toBe('NGUYEN VAN A');
    expect(payment.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(payment.qrString).toContain('970422');
    expect(payment.qrString).toContain(payment.code);
    expect(payment.qrString.startsWith('000201')).toBe(true);
    expect(payment.holdExpiresAt).toBeTruthy();

    const dbRow = await db.query(
      `SELECT status, payment_code, payment_amount, payment_snapshot, hold_expires_at, submitter_ip_hash
       FROM form_submissions WHERE access_token = $1`,
      [res.body.data.accessToken]
    );
    const row = dbRow.rows[0];
    expect(row.status).toBe('pending_payment');
    expect(row.payment_code).toBe(payment.code);
    // payment_amount là cột BIGINT — driver `pg` trả về STRING (tránh mất độ chính xác số lớn
    // ngoài Number.MAX_SAFE_INTEGER), khác payment.amount (số JS thật) đọc từ response JSON ở trên.
    expect(Number(row.payment_amount)).toBe(150000);
    expect(row.payment_snapshot).toEqual({
      bankBin: '970422',
      bankName: 'MB Bank',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN A',
      amount: 150000,
    });
    expect(row.hold_expires_at).not.toBeNull();
    expect(row.submitter_ip_hash).not.toBeNull();
    // Không phải sha256 trần của IP thô — không kiểm tra giá trị chính xác (phụ thuộc secret),
    // chỉ kiểm tra là chuỗi hex 64 ký tự (HMAC-SHA256).
    expect(row.submitter_ip_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('form đặt lịch + thu tiền → 201, status pending_payment (KHÔNG confirmed), có appointmentAt trong response payment', async () => {
    const owner = await createUser({ username: 'owner_pay_booking' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 1,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });

    const appointmentDate = futureDate(3);
    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });

    expect(res.status).toBe(201);
    expect(res.body.data.payment).toBeTruthy();

    const dbRow = await db.query(
      `SELECT status, appointment_at FROM form_submissions WHERE access_token = $1`,
      [res.body.data.accessToken]
    );
    expect(dbRow.rows[0].status).toBe('pending_payment');
    expect(dbRow.rows[0].appointment_at).not.toBeNull();
  });

  it('GET public form (thu tiền) → payment.amount + method, KHÔNG có bankBin/accountNumber/accountName', async () => {
    const owner = await createUser({ username: 'owner_pay_getpublic' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });

    const res = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toEqual({ enabled: true, amount: 150000, method: 'bank' });
    const raw = JSON.stringify(res.body.data);
    expect(raw).not.toContain('0123456789');
    expect(raw).not.toContain('NGUYEN VAN A');
  });
});

describe('PR-3a — sức chứa (đặt lịch + thu tiền dùng chung §4.3)', () => {
  it('A đang giữ chỗ (pending_payment còn hạn), B đặt cùng khung (sức chứa 1) → B 409', async () => {
    const owner = await createUser({ username: 'owner_pay_slot1' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 1,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const appointmentDate = futureDate(5);

    const resA = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(resA.status).toBe(201);

    const resB = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(resB.status).toBe(409);
    expect(resB.body.code).toBe('FORM_SLOT_FULL');
  });

  it('lùi hold_expires_at của A về quá khứ (hết hạn giữ chỗ) → B đặt lại cùng khung → 201', async () => {
    const owner = await createUser({ username: 'owner_pay_slot2' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 1,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const appointmentDate = futureDate(6);

    const resA = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(resA.status).toBe(201);

    const rowA = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [resA.body.data.accessToken]);
    await setHoldExpiresAtPast(rowA.rows[0].id);

    const resB = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(resB.status).toBe(201);
  });
});

describe('PR-3a — chủ form xác nhận đã nhận tiền (confirm-payment)', () => {
  async function submitPending(form, appointmentDate) {
    const body = appointmentDate
      ? { answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME }
      : { answers: {} };
    const res = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send(body);
    expect(res.status).toBe(201);
    const row = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [res.body.data.accessToken]);
    return { accessToken: res.body.data.accessToken, submissionId: row.rows[0].id };
  }

  it('A hết hạn giữ chỗ, B đã lấy chỗ trước khi chủ xác nhận A → 409 FORM_SLOT_TAKEN, A VẪN pending_payment', async () => {
    const owner = await createUser({ username: 'owner_pay_confirm1' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 1,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const appointmentDate = futureDate(7);

    const a = await submitPending(form, appointmentDate);
    await setHoldExpiresAtPast(a.submissionId);

    const b = await submitPending(form, appointmentDate);
    expect(b.submissionId).toBeTruthy();

    const confirmRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${a.submissionId}/confirm-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(confirmRes.status).toBe(409);
    expect(confirmRes.body.code).toBe('FORM_SLOT_TAKEN');

    const dbRow = await db.query(`SELECT status FROM form_submissions WHERE id = $1`, [a.submissionId]);
    expect(dbRow.rows[0].status).toBe('pending_payment');
  });

  it('A hết hạn giữ chỗ, KHÔNG ai lấy chỗ → chủ xác nhận → confirmed, có paid_confirmed_by', async () => {
    const owner = await createUser({ username: 'owner_pay_confirm2' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 1,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const appointmentDate = futureDate(8);

    const a = await submitPending(form, appointmentDate);
    await setHoldExpiresAtPast(a.submissionId);

    const confirmRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${a.submissionId}/confirm-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('confirmed');

    const dbRow = await db.query(`SELECT status, paid_confirmed_by, paid_confirmed_at FROM form_submissions WHERE id = $1`, [a.submissionId]);
    expect(dbRow.rows[0].status).toBe('confirmed');
    expect(dbRow.rows[0].paid_confirmed_by).toBe(owner.id);
    expect(dbRow.rows[0].paid_confirmed_at).not.toBeNull();
  });

  it('xác nhận NHIỀU LẦN đồng thời (Promise.all, 20 request) → ĐÚNG 1 cái 200, còn lại 409', async () => {
    // 2 request đồng thời không đủ áp lực để lộ việc THIẾU khoá nguyên tử ở UPDATE — pre-check
    // đọc-rồi-so-sánh ở form.service.js (đọc TRƯỚC UPDATE) tình cờ đã chặn được hầu hết race 2
    // chiều trong Node đơn luồng (request thứ 2 thường pre-check SAU khi request 1 đã COMMIT).
    // Tăng lên 20 request thật đồng thời — giống hướng dẫn formsBooking.test.js (10→30 POST) —
    // để buộc ít nhất 2 pre-check cùng đọc 'pending_payment' TRƯỚC khi cái nào UPDATE xong, phơi
    // đúng ca chỉ có khoá WHERE status='pending_payment' ở UPDATE mới chặn được (đột biến #3).
    const owner = await createUser({ username: 'owner_pay_confirm_race' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });

    const a = await submitPending(form, null);

    const requests = Array.from({ length: 20 }, () =>
      request(app)
        .post(`/api/forms/${form.id}/submissions/${a.submissionId}/confirm-payment`)
        .set('Authorization', `Bearer ${token}`)
        .send()
    );
    const results = await Promise.all(requests);
    const oks = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);
    expect(oks).toHaveLength(1);
    expect(conflicts).toHaveLength(19);

    const dbRow = await db.query(`SELECT status, paid_confirmed_by FROM form_submissions WHERE id = $1`, [a.submissionId]);
    expect(dbRow.rows[0].status).toBe('confirmed');
    expect(dbRow.rows[0].paid_confirmed_by).toBe(owner.id);
  }, 20000);

  it('chủ đổi STK sau khi A đã đặt → GET trạng thái của A vẫn hiện STK CŨ (payment_snapshot, không phải payment_config hiện tại)', async () => {
    const owner = await createUser({ username: 'owner_pay_snapshot' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });

    const a = await submitPending(form, null);

    const changeRes = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paymentConfig: { ...VALID_PAYMENT_CONFIG, accountNumber: '9999999999', accountName: 'tai khoan moi' } });
    expect(changeRes.status).toBe(200);

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${a.accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.payment.accountNumber).toBe('0123456789');
    expect(statusRes.body.data.payment.accountName).toBe('NGUYEN VAN A');
  });
});

describe('PR-3a — chống giữ chỗ hàng loạt theo IP', () => {
  it('cùng IP (test luôn cùng loopback), giữ chỗ lượt thứ 4 trên MỘT form → 429 FORM_TOO_MANY_PENDING_HOLDS', async () => {
    const owner = await createUser({ username: 'owner_pay_ip' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });
      results.push(res);
    }

    expect(results[0].status).toBe(201);
    expect(results[1].status).toBe(201);
    expect(results[2].status).toBe(201);
    expect(results[3].status).toBe(429);
    expect(results[3].body.code).toBe('FORM_TOO_MANY_PENDING_HOLDS');

    const dbCount = await db.query(`SELECT COUNT(*)::int AS n FROM form_submissions WHERE form_id = $1`, [form.id]);
    expect(dbCount.rows[0].n).toBe(3);
  });
});

describe('PR-3a — trang trạng thái công khai', () => {
  it('access_token sai 1 ký tự → 404', async () => {
    const owner = await createUser({ username: 'owner_pay_status1' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {} });
    const wrongToken = res.body.data.accessToken.slice(0, -1) + (res.body.data.accessToken.slice(-1) === 'a' ? 'b' : 'a');

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${wrongToken}`);
    expect(statusRes.status).toBe(404);
  });

  it('access_token đúng nhưng thuộc FORM KHÁC (cùng chủ) → 404', async () => {
    const owner = await createUser({ username: 'owner_pay_status2' });
    const token = await loginAs(owner);
    const formA = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG, title: 'Form A' });
    const formB = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG, title: 'Form B' });

    const resA = await request(app).post(`/api/public/forms/${formA.publicKey}/submissions`).send({ answers: {} });
    const accessTokenOfA = resA.body.data.accessToken;

    const statusRes = await request(app).get(`/api/public/forms/${formB.publicKey}/submissions/${accessTokenOfA}`);
    expect(statusRes.status).toBe(404);
  });

  it('đã hết hạn giữ chỗ → payment: null (dù status vẫn pending_payment), holdExpired: true', async () => {
    const owner = await createUser({ username: 'owner_pay_status3' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const res = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });
    const row = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [res.body.data.accessToken]);
    await setHoldExpiresAtPast(row.rows[0].id);

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${res.body.data.accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('pending_payment');
    expect(statusRes.body.data.holdExpired).toBe(true);
    expect(statusRes.body.data.payment).toBeNull();
  });

  it('đã được xác nhận (confirmed) → payment: null', async () => {
    const owner = await createUser({ username: 'owner_pay_status4' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const res = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });
    const row = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [res.body.data.accessToken]);

    const confirmRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${row.rows[0].id}/confirm-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(confirmRes.status).toBe(200);

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${res.body.data.accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('confirmed');
    expect(statusRes.body.data.payment).toBeNull();
  });

  it('không trả tên/email/SĐT người đặt trong trang trạng thái', async () => {
    const owner = await createUser({ username: 'owner_pay_status5' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      fields: [
        { label: 'Họ tên', type: 'short_text', required: true, role: 'name' },
        { label: 'Email', type: 'email', required: false, role: 'email' },
      ],
    });
    const nameField = form.fields.find((f) => f.role === 'name');
    const emailField = form.fields.find((f) => f.role === 'email');

    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [nameField.key]: 'Nguyễn Văn Bí Mật', [emailField.key]: 'secret_respondent@example.com' } });

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${res.body.data.accessToken}`);
    const raw = JSON.stringify(statusRes.body.data);
    expect(raw).not.toContain('Bí Mật');
    expect(raw).not.toContain('secret_respondent');
  });
});

describe('PR-3a — super admin: tắt/bật form', () => {
  it('người không phải admin gọi GET /api/admin/forms → 403', async () => {
    const owner = await createUser({ username: 'owner_pay_notadmin' });
    const token = await loginAs(owner);
    const res = await request(app).get('/api/admin/forms').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin tắt form → public GET/POST/trạng thái đều 404; admin bật lại → hoạt động lại bình thường', async () => {
    const owner = await createUser({ username: 'owner_pay_admindisable' });
    const admin = await createUser({ username: 'admin_pay_disable', role: 'admin' });
    const ownerToken = await loginAs(owner);
    const adminToken = await loginAs(admin);
    const form = await createPublishedForm(ownerToken, { paymentConfig: VALID_PAYMENT_CONFIG });

    const submitBefore = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });
    expect(submitBefore.status).toBe(201);
    const statusUrl = `/api/public/forms/${form.publicKey}/submissions/${submitBefore.body.data.accessToken}`;

    const disableRes = await request(app)
      .put(`/api/admin/forms/${form.id}/disable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.adminDisabledAt).toBeTruthy();

    expect((await request(app).get(`/api/public/forms/${form.publicKey}`)).status).toBe(404);
    expect((await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} })).status).toBe(404);
    expect((await request(app).get(statusUrl)).status).toBe(404);

    const enableRes = await request(app)
      .put(`/api/admin/forms/${form.id}/enable`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.adminDisabledAt).toBeNull();

    expect((await request(app).get(`/api/public/forms/${form.publicKey}`)).status).toBe(200);
    expect((await request(app).get(statusUrl)).status).toBe(200);
  });

  it('GET /api/admin/forms?q= tìm theo public_key trả đúng form, kèm hasPayment/submissionCount', async () => {
    const owner = await createUser({ username: 'owner_pay_adminsearch' });
    const admin = await createUser({ username: 'admin_pay_search', role: 'admin' });
    const ownerToken = await loginAs(owner);
    const adminToken = await loginAs(admin);
    const form = await createPublishedForm(ownerToken, { paymentConfig: VALID_PAYMENT_CONFIG });
    await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });

    const res = await request(app)
      .get(`/api/admin/forms?q=${form.publicKey}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.forms).toHaveLength(1);
    expect(res.body.data.forms[0].publicKey).toBe(form.publicKey);
    expect(res.body.data.forms[0].hasPayment).toBe(true);
    expect(res.body.data.forms[0].submissionCount).toBe(1);
  });
});

describe('PR-3a — thư nhắc lịch không gửi cho lượt chờ thanh toán', () => {
  it('lượt pending_payment có hẹn trong 24h tới (tạo đủ sớm) → cron nhắc KHÔNG gửi (sent:0)', async () => {
    const owner = await createUser({ username: 'owner_pay_reminder' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: null,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const appointmentDate = futureDate(3);
    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [form.fields[0].key]: 'reminder_pending@example.com' }, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(res.status).toBe(201);

    const row = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [res.body.data.accessToken]);
    // Đẩy hẹn vào trong cửa sổ (NOW, NOW+24h] và tạo đủ sớm (>24h trước hẹn) — đúng điều kiện
    // ứng viên nhắc lịch NẾU status hợp lệ; ở đây status vẫn 'pending_payment' nên phải bị lọc.
    await db.query(
      `UPDATE form_submissions
       SET appointment_at = NOW() + INTERVAL '23 hours 50 minutes',
           created_at = NOW() - INTERVAL '3 days'
       WHERE id = $1`,
      [row.rows[0].id]
    );
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('PR-3a — huỷ lượt pending_payment', () => {
  it('chủ huỷ lượt pending_payment → 200; khung giờ được nhả cho lượt sau', async () => {
    const owner = await createUser({ username: 'owner_pay_cancel' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, {
      paymentConfig: VALID_PAYMENT_CONFIG,
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 1,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const appointmentDate = futureDate(9);

    const resA = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(resA.status).toBe(201);
    const rowA = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [resA.body.data.accessToken]);

    const blockedB = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(blockedB.status).toBe(409);

    const cancelRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${rowA.rows[0].id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');

    const resB = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(resB.status).toBe(201);
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, "Bổ sung 15/09 khi soạn lệnh PR-3b" mục 5 —
 * hai nợ PR-3a gộp vào PR-3b: (1) trạng thái công khai không chặn khi chủ hết gói; (2) test
 * integration cho thư hướng dẫn chuyển khoản + thư "đã xác nhận" (kèm escape HTML).
 */
describe('PR-3b — thư hướng dẫn chuyển khoản + thư đã xác nhận + chủ hết gói vẫn xem được trạng thái', () => {
  it('nộp bài thu tiền có email + sendConfirmation → thư hướng dẫn chứa ngân hàng/STK/số tiền/mã/link trạng thái, HTML đã escape', async () => {
    const owner = await createUser({ username: 'owner_pay_mail1' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const emailField = form.fields[0];

    // Chèn thẳng payment_config có accountName chứa HTML — bỏ qua validate của normalizePaymentConfig
    // (chặn ký tự ngoài [A-Z0-9 ] ở tầng API, ĐÚNG như thiết kế) để phơi đúng lớp phòng thủ thứ
    // hai: escapeHtml() ở template thư, phòng khi dữ liệu tới bằng đường khác trong tương lai.
    await db.query(
      `UPDATE forms SET payment_config = jsonb_set(payment_config, '{accountName}', '"NGUYEN VAN A <b>HACK</b>"') WHERE id = $1`,
      [form.id]
    );

    mockSendMail.mockClear();
    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'payer_mail1@example.com' } });
    expect(res.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const call = mockSendMail.mock.calls.find((c) => c[0].to === 'payer_mail1@example.com');
    expect(call).toBeTruthy();
    const { subject, html } = call[0];
    expect(subject).toContain('Hướng dẫn chuyển khoản');
    expect(html).toContain('MB Bank');
    expect(html).toContain('0123456789');
    expect(html).toContain('150.000');
    expect(html).toContain(res.body.data.payment.code);
    expect(html).toContain(`/f/${form.publicKey}/s/${res.body.data.accessToken}`);
    // Escape đúng — không lọt thẻ <b> sống vào email HTML.
    expect(html).toContain('&lt;b&gt;HACK&lt;/b&gt;');
    expect(html).not.toContain('<b>HACK</b>');
  });

  it('chủ bấm "Đã nhận tiền" → thư "đã xác nhận" gửi ĐÚNG người đặt (không gửi cho chủ)', async () => {
    const owner = await createUser({ username: 'owner_pay_mail2', email: 'owner_pay_mail2@example.com' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const emailField = form.fields[0];

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { [emailField.key]: 'payer_mail2@example.com' } });
    expect(submitRes.status).toBe(201);
    const row = await db.query(`SELECT id FROM form_submissions WHERE access_token = $1`, [submitRes.body.data.accessToken]);

    mockSendMail.mockClear();
    const confirmRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${row.rows[0].id}/confirm-payment`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(confirmRes.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const toRespondent = mockSendMail.mock.calls.find((c) => c[0].to === 'payer_mail2@example.com');
    const toOwner = mockSendMail.mock.calls.find((c) => c[0].to === 'owner_pay_mail2@example.com');
    expect(toRespondent).toBeTruthy();
    expect(toRespondent[0].subject).toContain('Đã xác nhận thanh toán');
    expect(toOwner).toBeFalsy();
  });

  it('chủ ĐÃ HẾT GÓI (subscription_expires_at + grace_period_days quá khứ) → trang trạng thái vẫn 200', async () => {
    const owner = await createUser({ username: 'owner_pay_expired' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });

    const submitRes = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });
    expect(submitRes.status).toBe(201);

    await db.query(`UPDATE users SET subscription_expires_at = NOW() - INTERVAL '5 days' WHERE id = $1`, [owner.id]);
    await db.query(
      `UPDATE plans SET grace_period_days = 2 WHERE id = (SELECT active_plan_id FROM users WHERE id = $1)`,
      [owner.id]
    );

    // Xác nhận GET form public thường (vẫn dùng checkOwnerActivePlan) đúng là 503 — làm chứng
    // đối chứng rằng "chủ hết gói" ở test này THẬT SỰ có hiệu lực, không phải false negative.
    const publicFormRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(publicFormRes.status).toBe(503);

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${submitRes.body.data.accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.status).toBe('pending_payment');
    expect(statusRes.body.data.payment).toBeTruthy();
  });

  it('form bị ẨN (chưa xuất bản) → trang trạng thái VẪN 404 (chỉ bỏ chốt gói, không bỏ chốt ẩn/tắt)', async () => {
    const owner = await createUser({ username: 'owner_pay_unpublish' });
    const token = await loginAs(owner);
    const form = await createPublishedForm(token, { paymentConfig: VALID_PAYMENT_CONFIG });
    const submitRes = await request(app).post(`/api/public/forms/${form.publicKey}/submissions`).send({ answers: {} });

    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: false });

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${submitRes.body.data.accessToken}`);
    expect(statusRes.status).toBe(404);
  });
});
