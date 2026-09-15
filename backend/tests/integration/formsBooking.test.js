/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-2a — đặt lịch hẹn qua Form.
 *
 * Không dùng ngày cố định cho ca gọi API (ngày cố định sẽ thành quá khứ khi CI chạy sau này) —
 * tính ngày tương lai từ todayVn(new Date()) và khai đủ 7 thứ trong weeklySlots để ngày nào cũng
 * có khung. Ngày cố định chỉ dùng ở unit trên hàm thuần (formBooking.util.spec.js).
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

// Khung giờ có mặt ở CẢ 7 thứ trong tuần — appointmentDate rơi vào thứ nào cũng hợp lệ, không
// cần biết trước hôm nay là thứ mấy.
const ALL_WEEK_TIME = '23:00';
function allWeekSlots(time = ALL_WEEK_TIME) {
  return { 0: [time], 1: [time], 2: [time], 3: [time], 4: [time], 5: [time], 6: [time] };
}

function futureDate(daysFromNow) {
  return addDaysToDateStr(todayVn(new Date()), daysFromNow);
}

/**
 * Chèn thẳng N bài nộp "đã gửi thư" cho form (bỏ qua HTTP — 200 request thật sẽ rất chậm), để
 * dựng sẵn trạng thái "form đã chạm trần" mà không cần đặt 200 lịch hẹn thật.
 */
async function seedSentEmailSubmissions(formId, workspaceOwnerId, count, { column = 'confirmation_sent_at', hoursAgo = 1 } = {}) {
  await db.query(
    `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status, ${column})
     SELECT $1::bigint, $2::bigint, 'seed_' || $1::text || '_' || g, 'confirmed', NOW() - ($4::text || ' hours')::interval
     FROM generate_series(1, $3::int) AS g`,
    [formId, workspaceOwnerId, count, String(hoursAgo)]
  );
}

async function createBookingForm(token, overrides = {}) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Form Đặt Lịch Test',
      fields: [],
      settings: { sendConfirmation: true },
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: null,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
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

describe('Form booking — đặt lịch hẹn (PR-2a)', () => {
  it('sức chứa 2, 30 POST đồng thời cùng khung → đúng 2 cái 201, còn lại 409; DB đúng 2 dòng', async () => {
    // Nghiệm thu gốc của plan ghi "10 POST đồng thời" — đo thực tế trên máy này: bỏ hẳn
    // pg_advisory_xact_lock rồi chạy lại ca 10-POST 3 lần liên tiếp, CẢ 3 LẦN VẪN XANH (không
    // bắt được lỗi — đúng cảnh báo "có thể xanh ngẫu nhiên" mà plan đã lường trước). Tăng lên 30
    // theo đúng hướng dẫn của plan thì đột biến bị bắt ổn định (4 dòng thay vì 2, đã xác nhận lại
    // nhiều lần); bản KHÔNG đột biến vẫn xanh ổn định ở 30 (đã đo). Dùng 30 làm ngưỡng chính thức.
    const owner = await createUser({ username: 'owner_slot_race' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: 2,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });

    const appointmentDate = futureDate(3);
    const requests = Array.from({ length: 30 }, () =>
      request(app)
        .post(`/api/public/forms/${form.publicKey}/submissions`)
        .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME })
    );
    const results = await Promise.all(requests);

    const created = results.filter((r) => r.status === 201);
    const full = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(2);
    expect(full).toHaveLength(28);
    for (const r of full) {
      expect(r.body.code).toBe('FORM_SLOT_FULL');
    }

    const dbCount = await db.query(
      `SELECT COUNT(*)::int AS n FROM form_submissions WHERE form_id = $1 AND status = 'confirmed'`,
      [form.id]
    );
    expect(dbCount.rows[0].n).toBe(2);
  }, 30000);

  it('sức chứa null (không giới hạn), 5 POST đồng thời → 5 dòng', async () => {
    const owner = await createUser({ username: 'owner_slot_unlimited' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);

    const appointmentDate = futureDate(4);
    const requests = Array.from({ length: 5 }, () =>
      request(app)
        .post(`/api/public/forms/${form.publicKey}/submissions`)
        .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME })
    );
    const results = await Promise.all(requests);
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);

    const dbCount = await db.query(
      `SELECT COUNT(*)::int AS n FROM form_submissions WHERE form_id = $1`,
      [form.id]
    );
    expect(dbCount.rows[0].n).toBe(5);
  }, 30000);

  it('khung không có trong lịch tuần → 400', async () => {
    const owner = await createUser({ username: 'owner_slot_invalid' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);

    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate: futureDate(2), appointmentTime: '10:15' });
    expect(res.status).toBe(400);
  });

  it('Form bật đặt lịch, POST thiếu appointmentDate/Time → 400', async () => {
    const owner = await createUser({ username: 'owner_slot_missing' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);

    const res = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {} });
    expect(res.status).toBe(400);
  });

  it('PUT bookingConfig giờ "25:00" → 400', async () => {
    const owner = await createUser({ username: 'owner_slot_badtime' });
    const token = await loginAs(owner);
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form Giờ Sai' });
    const form = createRes.body.data;

    const res = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingConfig: { enabled: true, weeklySlots: { 1: ['25:00'] } } });
    expect(res.status).toBe(400);
  });

  it('PUT bookingConfig enabled:true không có khung nào → 400', async () => {
    const owner = await createUser({ username: 'owner_slot_noslot' });
    const token = await loginAs(owner);
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form Không Khung' });
    const form = createRes.body.data;

    const res = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingConfig: { enabled: true, weeklySlots: {} } });
    expect(res.status).toBe(400);
  });

  it('PUT bookingConfig slotCapacity: 0 → 400', async () => {
    const owner = await createUser({ username: 'owner_slot_cap0' });
    const token = await loginAs(owner);
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form Capacity 0' });
    const form = createRes.body.data;

    const res = await request(app)
      .put(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ bookingConfig: { enabled: true, weeklySlots: allWeekSlots(), slotCapacity: 0 } });
    expect(res.status).toBe(400);
  });

  it('GET public form trả booking:{enabled,daysAhead}; form không đặt lịch trả booking:null', async () => {
    const owner = await createUser({ username: 'owner_booking_flag' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: null,
        daysAhead: 45,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });

    const res = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toEqual({ enabled: true, daysAhead: 45 });

    // Form khác không bật đặt lịch
    const createRes2 = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Form Không Đặt Lịch' });
    const form2 = createRes2.body.data;
    await request(app)
      .put(`/api/forms/${form2.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });
    const res2 = await request(app).get(`/api/public/forms/${form2.publicKey}`);
    expect(res2.body.data.booking).toBeNull();
  });

  it('GET slots trả remaining đúng, đếm bằng truy vấn gom nhóm (khung đầy vẫn trả remaining:0)', async () => {
    const owner = await createUser({ username: 'owner_slots_list' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
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
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(bookRes.status).toBe(201);

    const slotsRes = await request(app)
      .get(`/api/public/forms/${form.publicKey}/slots`)
      .query({ from: futureDate(0), days: 7 });
    expect(slotsRes.status).toBe(200);
    const slot = slotsRes.body.data.slots.find((s) => s.date === appointmentDate && s.time === ALL_WEEK_TIME);
    expect(slot).toBeDefined();
    expect(slot.remaining).toBe(0);
  });

  it('Huỷ 1 lượt ở khung đầy (sức chứa 1) → slots remaining từ 0 lên 1; POST lại 201', async () => {
    const owner = await createUser({ username: 'owner_cancel_reopen' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
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
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(bookRes.status).toBe(201);

    const subRow = await db.query(
      `SELECT id FROM form_submissions WHERE form_id = $1 LIMIT 1`,
      [form.id]
    );
    const submissionId = subRow.rows[0].id;

    // Đầy chỗ — POST thứ hai vào đúng khung phải 409
    const fullRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(fullRes.status).toBe(409);

    // Huỷ lượt đầu
    const cancelRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${submissionId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');

    const slotsRes = await request(app)
      .get(`/api/public/forms/${form.publicKey}/slots`)
      .query({ from: futureDate(0), days: 7 });
    const slot = slotsRes.body.data.slots.find((s) => s.date === appointmentDate && s.time === ALL_WEEK_TIME);
    expect(slot.remaining).toBe(1);

    // POST lại thành công
    const reopenRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(reopenRes.status).toBe(201);
  });

  it('Huỷ lượt đã huỷ → 409; huỷ lượt của form khác (cùng chủ) → 404', async () => {
    const owner = await createUser({ username: 'owner_cancel_errors' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);
    const otherForm = await createBookingForm(token, { title: 'Form Khác' });

    const appointmentDate = futureDate(7);
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    const subRow = await db.query(`SELECT id FROM form_submissions WHERE form_id = $1 LIMIT 1`, [form.id]);
    const submissionId = subRow.rows[0].id;
    expect(bookRes.status).toBe(201);

    const cancelRes1 = await request(app)
      .post(`/api/forms/${form.id}/submissions/${submissionId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelRes1.status).toBe(200);

    const cancelAgainRes = await request(app)
      .post(`/api/forms/${form.id}/submissions/${submissionId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(cancelAgainRes.status).toBe(409);

    const wrongFormRes = await request(app)
      .post(`/api/forms/${otherForm.id}/submissions/${submissionId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(wrongFormRes.status).toBe(404);
  });

  it('?date= lọc đúng lượt hẹn 00:30 giờ VN vào NGÀY VN (không lệch sang hôm trước)', async () => {
    const owner = await createUser({ username: 'owner_date_filter' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots('00:30'),
        slotCapacity: null,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });

    const appointmentDate = futureDate(8);
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: '00:30' });
    expect(bookRes.status).toBe(201);

    // appointment_at thật (UTC) rơi vào NGÀY TRƯỚC appointmentDate (00:30 VN = 17:30 UTC hôm trước)
    const raw = await db.query(`SELECT appointment_at FROM form_submissions WHERE form_id = $1`, [form.id]);
    const apptUtcDate = raw.rows[0].appointment_at.toISOString().slice(0, 10);
    expect(apptUtcDate).not.toBe(appointmentDate);

    const listRes = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .query({ date: appointmentDate })
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.submissions).toHaveLength(1);

    // Ngày UTC (sai) không tìm thấy gì — chứng minh lọc theo giờ VN, không phải UTC.
    const wrongDateRes = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .query({ date: apptUtcDate })
      .set('Authorization', `Bearer ${token}`);
    expect(wrongDateRes.body.data.submissions).toHaveLength(0);
  });

  it('Thư báo chủ (notifyOwner) ghi thêm giờ hẹn; thư xác nhận gửi cho người đặt khi có email + sendConfirmation', async () => {
    const owner = await createUser({ username: 'owner_booking_mail', email: 'owner_booking@example.com' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
      settings: { notifyOwner: true, sendConfirmation: true },
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots(),
        slotCapacity: null,
        daysAhead: 60,
        minNoticeMinutes: 0,
        closedDates: [],
      },
    });
    const emailField = form.fields[0];

    mockSendMail.mockClear();
    const appointmentDate = futureDate(9);
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [emailField.key]: 'respondent@example.com' },
        appointmentDate,
        appointmentTime: ALL_WEEK_TIME,
      });
    expect(bookRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(mockSendMail).toHaveBeenCalledTimes(2);
    const toOwner = mockSendMail.mock.calls.find((c) => c[0].to === 'owner_booking@example.com');
    const toRespondent = mockSendMail.mock.calls.find((c) => c[0].to === 'respondent@example.com');
    expect(toOwner[0].html).toContain('Giờ hẹn');
    expect(toRespondent[0].html).toContain('Giờ hẹn');
    expect(toRespondent[0].subject).toContain('Xác nhận lịch hẹn');

    const dbRow = await db.query(
      `SELECT confirmation_sent_at FROM form_submissions WHERE form_id = $1`,
      [form.id]
    );
    expect(dbRow.rows[0].confirmation_sent_at).not.toBeNull();
  });
});

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7b — link "Rút lại đồng ý" trong thư xác nhận
 * lịch hẹn.
 */
describe('Form booking — link rút lại đồng ý trong thư xác nhận lịch hẹn (PR-7b)', () => {
  it('nộp bài có email + tích đồng ý + sendConfirmation → thư xác nhận có link /api/public/forms/unsubscribe/<token đúng của bài>', async () => {
    const owner = await createUser({ username: 'owner_booking_unsub_1' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
      settings: { sendConfirmation: true },
    });
    const emailField = form.fields[0];

    mockSendMail.mockClear();
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [emailField.key]: 'booking_unsub1@example.com' },
        appointmentDate: futureDate(9),
        appointmentTime: ALL_WEEK_TIME,
        marketingConsent: true,
      });
    expect(bookRes.status).toBe(201);

    const row = await db.query(
      `SELECT unsubscribe_token FROM form_submissions WHERE access_token = $1`,
      [bookRes.body.data.accessToken]
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    const call = mockSendMail.mock.calls.find((c) => c[0].to === 'booking_unsub1@example.com');
    expect(call).toBeTruthy();
    expect(call[0].subject).toContain('Xác nhận lịch hẹn');
    expect(call[0].html).toContain(`/api/public/forms/unsubscribe/${row.rows[0].unsubscribe_token}`);
  });

  it('nộp bài có email nhưng KHÔNG tích đồng ý → thư xác nhận lịch hẹn KHÔNG có link rút', async () => {
    const owner = await createUser({ username: 'owner_booking_unsub_2' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
      settings: { sendConfirmation: true },
    });
    const emailField = form.fields[0];

    mockSendMail.mockClear();
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [emailField.key]: 'booking_unsub2@example.com' },
        appointmentDate: futureDate(9),
        appointmentTime: ALL_WEEK_TIME,
      });
    expect(bookRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const call = mockSendMail.mock.calls.find((c) => c[0].to === 'booking_unsub2@example.com');
    expect(call).toBeTruthy();
    expect(call[0].html).not.toContain('/api/public/forms/unsubscribe/');
  });
});

describe('Form booking — review PR-2a 14/09: trần thư, ?date= sai, huỷ nguyên tử', () => {
  it('form đã có 200 thư người đặt trong 24h → đặt lịch mới có email vẫn 201, KHÔNG gửi thư', async () => {
    const owner = await createUser({ username: 'owner_cap_form' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
    });
    await seedSentEmailSubmissions(form.id, owner.id, 200);

    mockSendMail.mockClear();
    const emailField = form.fields[0];
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [emailField.key]: 'capped_form@example.com' },
        appointmentDate: futureDate(11),
        appointmentTime: ALL_WEEK_TIME,
      });
    expect(bookRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('cùng một email đã nhận 3 thư xác nhận trong 24h QUA 2 FORM KHÁC NHAU → đặt lịch lần 4 vẫn 201, KHÔNG gửi', async () => {
    const owner = await createUser({ username: 'owner_cap_recipient' });
    const token = await loginAs(owner);
    const formA = await createBookingForm(token, {
      title: 'Form A',
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
    });
    const formB = await createBookingForm(token, {
      title: 'Form B',
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
    });

    const capEmail = 'sniped@example.com';
    // 3 thư xác nhận đã gửi cho CÙNG email, rải trên 2 form khác nhau.
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status, respondent_email, confirmation_sent_at)
       VALUES
         ($1, $3, 'seed_r1', 'confirmed', $4, NOW() - INTERVAL '1 hour'),
         ($1, $3, 'seed_r2', 'confirmed', $4, NOW() - INTERVAL '2 hours'),
         ($2, $3, 'seed_r3', 'confirmed', $4, NOW() - INTERVAL '3 hours')`,
      [formA.id, formB.id, owner.id, capEmail]
    );

    mockSendMail.mockClear();
    const emailFieldA = formA.fields[0];
    const bookRes = await request(app)
      .post(`/api/public/forms/${formA.publicKey}/submissions`)
      .send({
        answers: { [emailFieldA.key]: capEmail },
        appointmentDate: futureDate(12),
        appointmentTime: ALL_WEEK_TIME,
      });
    expect(bookRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('trần theo người nhận so sánh KHÔNG phân biệt HOA/thường', async () => {
    const owner = await createUser({ username: 'owner_cap_case' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
    });

    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status, respondent_email, confirmation_sent_at)
       VALUES
         ($1, $2, 'seed_c1', 'confirmed', 'MixedCase@Example.com', NOW() - INTERVAL '1 hour'),
         ($1, $2, 'seed_c2', 'confirmed', 'mixedcase@example.com', NOW() - INTERVAL '2 hours'),
         ($1, $2, 'seed_c3', 'confirmed', 'MIXEDCASE@EXAMPLE.COM', NOW() - INTERVAL '3 hours')`,
      [form.id, owner.id]
    );

    mockSendMail.mockClear();
    const emailField = form.fields[0];
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        // Viết hoa khác hẳn 3 dòng trên — vẫn phải bị tính chung vào trần.
        answers: { [emailField.key]: 'mixedCASE@example.com' },
        appointmentDate: futureDate(13),
        appointmentTime: ALL_WEEK_TIME,
      });
    expect(bookRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('thư CŨ HƠN 24h không tính vào trần — vẫn gửi bình thường', async () => {
    const owner = await createUser({ username: 'owner_cap_old' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token, {
      fields: [{ label: 'Email', type: 'email', required: false, role: 'email' }],
    });
    // 200 thư nhưng cách đây 25 giờ — ngoài cửa sổ 24h, không được tính vào trần theo form.
    await seedSentEmailSubmissions(form.id, owner.id, 200, { hoursAgo: 25 });

    mockSendMail.mockClear();
    const emailField = form.fields[0];
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [emailField.key]: 'fresh_again@example.com' },
        appointmentDate: futureDate(14),
        appointmentTime: ALL_WEEK_TIME,
      });
    expect(bookRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('?date=abc và ?date=2026-02-31 → 400 INVALID_DATE; không lặng lẽ đổi thành ngày khác', async () => {
    const owner = await createUser({ username: 'owner_date_invalid' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);

    const resAbc = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .query({ date: 'abc' })
      .set('Authorization', `Bearer ${token}`);
    expect(resAbc.status).toBe(400);
    expect(resAbc.body.code).toBe('INVALID_DATE');

    const resFeb31 = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .query({ date: '2026-02-31' })
      .set('Authorization', `Bearer ${token}`);
    expect(resFeb31.status).toBe(400);
    expect(resFeb31.body.code).toBe('INVALID_DATE');
  });

  it('không truyền ?date= vẫn hoạt động như cũ (200, không lọc)', async () => {
    const owner = await createUser({ username: 'owner_date_absent' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);
    const res = await request(app)
      .get(`/api/forms/${form.id}/submissions`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('huỷ 2 lần đồng thời (Promise.all) cùng một lượt → đúng 1 cái 200, 1 cái 409', async () => {
    const owner = await createUser({ username: 'owner_cancel_race' });
    const token = await loginAs(owner);
    const form = await createBookingForm(token);

    const appointmentDate = futureDate(15);
    const bookRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {}, appointmentDate, appointmentTime: ALL_WEEK_TIME });
    expect(bookRes.status).toBe(201);
    const subRow = await db.query(`SELECT id FROM form_submissions WHERE form_id = $1`, [form.id]);
    const submissionId = subRow.rows[0].id;

    const [r1, r2] = await Promise.all([
      request(app).post(`/api/forms/${form.id}/submissions/${submissionId}/cancel`).set('Authorization', `Bearer ${token}`),
      request(app).post(`/api/forms/${form.id}/submissions/${submissionId}/cancel`).set('Authorization', `Bearer ${token}`),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const finalRow = await db.query(`SELECT status FROM form_submissions WHERE id = $1`, [submissionId]);
    expect(finalRow.rows[0].status).toBe('cancelled');
  }, 15000);
});
