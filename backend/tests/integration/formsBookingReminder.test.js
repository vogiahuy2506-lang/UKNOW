/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-2a việc 5 — cron form_booking_reminder.
 * Gọi thẳng runFormBookingReminder() (không qua HTTP) để test được — cron thật trong
 * scheduler.js chỉ bọc recordRun quanh đúng hàm này. Lùi created_at/appointment_at bằng UPDATE
 * trực tiếp trong DB (không phải ngày cố định).
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

const ALL_WEEK_TIME = '23:00';
function allWeekSlots(time = ALL_WEEK_TIME) {
  return { 0: [time], 1: [time], 2: [time], 3: [time], 4: [time], 5: [time], 6: [time] };
}
function futureDate(daysFromNow) {
  return addDaysToDateStr(todayVn(new Date()), daysFromNow);
}

async function bookAppointment(token, { title = 'Form Nhắc Lịch', email = 'respondent@example.com', sendConfirmation = true, marketingConsent = null } = {}) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title,
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
      settings: { sendConfirmation },
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: null,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
  const form = createRes.body.data;
  await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });

  const emailField = form.fields[0];
  const answers = email ? { [emailField.key]: email } : {};
  const body = { answers, appointmentDate: futureDate(10), appointmentTime: ALL_WEEK_TIME };
  if (marketingConsent !== null) body.marketingConsent = marketingConsent;
  const bookRes = await request(app)
    .post(`/api/public/forms/${form.publicKey}/submissions`)
    .send(body);
  expect(bookRes.status).toBe(201);

  const row = await db.query(`SELECT id, unsubscribe_token FROM form_submissions WHERE form_id = $1`, [form.id]);
  return { formId: form.id, submissionId: row.rows[0].id, unsubscribeToken: row.rows[0].unsubscribe_token };
}

/** Đặt appointment_at cách "giờ hẹn cách NOW `hoursFromNow` giờ", created_at cách appointment_at `createdDaysBeforeAppointment` ngày. */
async function backdateSubmission(submissionId, { hoursFromNow, createdDaysBeforeAppointment }) {
  await db.query(
    `UPDATE form_submissions
     SET appointment_at = NOW() + ($2 || ' hours')::interval,
         created_at = NOW() + ($2 || ' hours')::interval - ($3 || ' days')::interval
     WHERE id = $1`,
    [submissionId, String(hoursFromNow), String(createdDaysBeforeAppointment)]
  );
}

describe('Cron form_booking_reminder (PR-2a việc 5)', () => {
  it('lượt hẹn sau 23h50 (tạo 3 ngày trước) → chạy nhắc 2 lần liền: lần 1 sent 1, lần 2 sent 0; sendMail gọi 1 lần', async () => {
    const owner = await createUser({ username: 'owner_reminder_ok' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token, { email: 'wait_reminder@example.com' });
    await backdateSubmission(submissionId, { hoursFromNow: 23.83, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const first = await runFormBookingReminder();
    expect(first.sent).toBe(1);
    expect(first.failed).toBe(0);

    const second = await runFormBookingReminder();
    expect(second.sent).toBe(0);
    expect(second.failed).toBe(0);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe('wait_reminder@example.com');

    const row = await db.query(`SELECT reminder_sent_at FROM form_submissions WHERE id = $1`, [submissionId]);
    expect(row.rows[0].reminder_sent_at).not.toBeNull();
  });

  it('hai lượt cron CHỒNG NHAU (Promise.all, không phải gọi nối tiếp) trên cùng 1 lượt hẹn → giành trước rồi mới gửi chặn được double-send: chỉ 1 lượt gửi, sendMail gọi đúng 1 lần', async () => {
    // Ca "2 lần liền" ở trên gọi NỐI TIẾP (await xong lần 1 mới gọi lần 2) — không lộ được lỗi
    // thiếu khoá ở bước giành (claimReminderSlot): đã tự kiểm bằng cách bỏ điều kiện
    // "AND reminder_sent_at IS NULL" ở UPDATE giành — ca nối tiếp phía trên VẪN xanh, vì bước
    // liệt ứng viên (listBookingReminderCandidates, không đổi) đã tự loại dòng vừa nhắc trước khi
    // lượt gọi thứ hai kịp bắt đầu. Bug thật chỉ lộ khi HAI LƯỢT THẬT SỰ CHỒNG NHAU (hai cron tick
    // 15 phút đè lên nhau vì lượt trước chạy chậm) — dùng Promise.all để mô phỏng đúng việc đó.
    const owner = await createUser({ username: 'owner_reminder_overlap' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token, { email: 'overlap_reminder@example.com' });
    await backdateSubmission(submissionId, { hoursFromNow: 23.83, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const [r1, r2] = await Promise.all([runFormBookingReminder(), runFormBookingReminder()]);
    expect(r1.sent + r2.sent).toBe(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe('overlap_reminder@example.com');

    const row = await db.query(`SELECT reminder_sent_at FROM form_submissions WHERE id = $1`, [submissionId]);
    expect(row.rows[0].reminder_sent_at).not.toBeNull();
  });

  it('lượt tạo 2 giờ trước giờ hẹn (chưa đủ 24h) → không nhắc', async () => {
    const owner = await createUser({ username: 'owner_reminder_toosoon' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token);
    await backdateSubmission(submissionId, { hoursFromNow: 20, createdDaysBeforeAppointment: 0.083 }); // tạo 2h trước hẹn
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();

    const row = await db.query(`SELECT reminder_sent_at FROM form_submissions WHERE id = $1`, [submissionId]);
    expect(row.rows[0].reminder_sent_at).toBeNull();
  });

  it('lượt đã huỷ → không nhắc', async () => {
    const owner = await createUser({ username: 'owner_reminder_cancelled' });
    const token = await loginAs(owner);
    const { formId, submissionId } = await bookAppointment(token);
    await backdateSubmission(submissionId, { hoursFromNow: 20, createdDaysBeforeAppointment: 3 });
    await request(app)
      .post(`/api/forms/${formId}/submissions/${submissionId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('không có email → không nhắc, không lỗi', async () => {
    const owner = await createUser({ username: 'owner_reminder_noemail' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token, { email: null });
    await backdateSubmission(submissionId, { hoursFromNow: 20, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('form tắt sendConfirmation → không nhắc', async () => {
    const owner = await createUser({ username: 'owner_reminder_offswitch' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token, { sendConfirmation: false });
    await backdateSubmission(submissionId, { hoursFromNow: 20, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('hàm gửi thư ném lỗi khi nhắc → failed:1, reminder_sent_at về NULL', async () => {
    const owner = await createUser({ username: 'owner_reminder_failsend' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token);
    await backdateSubmission(submissionId, { hoursFromNow: 20, createdDaysBeforeAppointment: 3 });

    mockSendMail.mockClear();
    mockSendMail.mockRejectedValueOnce(new Error('SMTP tạm thời không gửi được'));

    const result = await runFormBookingReminder();
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);

    const row = await db.query(`SELECT reminder_sent_at FROM form_submissions WHERE id = $1`, [submissionId]);
    expect(row.rows[0].reminder_sent_at).toBeNull();
  });

  it('form đã chạm trần 200 thư/24h → cron KHÔNG gửi nhắc, KHÔNG claim (reminder_sent_at vẫn NULL), skippedByCap ≥ 1', async () => {
    const owner = await createUser({ username: 'owner_reminder_cap' });
    const token = await loginAs(owner);
    const { formId, submissionId } = await bookAppointment(token);
    await backdateSubmission(submissionId, { hoursFromNow: 20, createdDaysBeforeAppointment: 3 });

    // 200 thư đã gửi cho CHÍNH form này trong 24h qua (trộn xác nhận + nhắc, như trần yêu cầu).
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status, confirmation_sent_at)
       SELECT $1::bigint, $2::bigint, 'seed_' || $1::text || '_' || g, 'confirmed', NOW() - INTERVAL '1 hour'
       FROM generate_series(1, 200) AS g`,
      [formId, owner.id]
    );

    mockSendMail.mockClear();
    const result = await runFormBookingReminder();
    expect(result.sent).toBe(0);
    expect(result.skippedByCap).toBeGreaterThanOrEqual(1);
    expect(mockSendMail).not.toHaveBeenCalled();

    const row = await db.query(`SELECT reminder_sent_at FROM form_submissions WHERE id = $1`, [submissionId]);
    expect(row.rows[0].reminder_sent_at).toBeNull();
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7b — link "Rút lại đồng ý" trong thư nhắc lịch.
 */
describe('Cron form_booking_reminder — link rút lại đồng ý (PR-7b)', () => {
  it('bài đã tích đồng ý → thư nhắc lịch có link /api/public/forms/unsubscribe/<token đúng của bài>', async () => {
    const owner = await createUser({ username: 'owner_reminder_consent' });
    const token = await loginAs(owner);
    const { submissionId, unsubscribeToken } = await bookAppointment(token, {
      email: 'reminder_consent@example.com',
      marketingConsent: true,
    });
    await backdateSubmission(submissionId, { hoursFromNow: 23.83, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(1);

    const call = mockSendMail.mock.calls.find((c) => c[0].to === 'reminder_consent@example.com');
    expect(call).toBeTruthy();
    expect(call[0].html).toContain(`/api/public/forms/unsubscribe/${unsubscribeToken}`);
  });

  it('bài KHÔNG tích đồng ý → thư nhắc lịch KHÔNG có link rút', async () => {
    const owner = await createUser({ username: 'owner_reminder_noconsent' });
    const token = await loginAs(owner);
    const { submissionId } = await bookAppointment(token, {
      email: 'reminder_noconsent@example.com',
      marketingConsent: false,
    });
    await backdateSubmission(submissionId, { hoursFromNow: 23.83, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(1);

    const call = mockSendMail.mock.calls.find((c) => c[0].to === 'reminder_noconsent@example.com');
    expect(call).toBeTruthy();
    expect(call[0].html).not.toContain('/api/public/forms/unsubscribe/');
  });

  it('bài đã đồng ý NHƯNG đã rút trước đó (bấm link) → thư nhắc lịch gửi sau đó KHÔNG có link rút', async () => {
    const owner = await createUser({ username: 'owner_reminder_withdrawn' });
    const token = await loginAs(owner);
    const { submissionId, unsubscribeToken } = await bookAppointment(token, {
      email: 'reminder_withdrawn@example.com',
      marketingConsent: true,
    });

    const unsubRes = await request(app).get(`/api/public/forms/unsubscribe/${unsubscribeToken}`);
    expect(unsubRes.status).toBe(200);

    await backdateSubmission(submissionId, { hoursFromNow: 23.83, createdDaysBeforeAppointment: 3 });
    mockSendMail.mockClear();

    const result = await runFormBookingReminder();
    expect(result.sent).toBe(1);

    const call = mockSendMail.mock.calls.find((c) => c[0].to === 'reminder_withdrawn@example.com');
    expect(call).toBeTruthy();
    expect(call[0].html).not.toContain('/api/public/forms/unsubscribe/');
  });
});
