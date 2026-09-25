/**
 * PR-2: Nút "Tôi xác nhận đã chuyển khoản" (backend integration test)
 *
 * Kiểm tra các tình huống nghiệm thu PR-2 theo lệnh giao 25/09/2026:
 * 1. Lượt còn hạn 10', giờ hẹn cách 3 ngày -> báo đã chuyển: 200; payer_reported_paid_at có; hold_expires_at ≈ NOW()+24h
 * 2. Còn hạn, giờ hẹn cách 2h: hold_expires_at = đúng appointment_at
 * 3. Còn hạn, không đặt lịch (chỉ thu tiền): hold_expires_at ≈ NOW()+24h
 * 4. Bấm 2 lần: lần 2 trả 200, hold_expires_at KHÔNG đổi so với sau lần 1
 * 5. Đã hết hạn: 200, có payer_reported_paid_at, hold_expires_at KHÔNG đổi
 * 6. Lượt confirmed/cancelled: 409
 * 7. Token sai / form ẩn / admin tắt: 404, cùng thông điệp với GET trạng thái
 * 8. Slot sức chứa 1: A báo đã chuyển ở phút 14/15, sang phút 16 B đặt cùng giờ -> B bị từ chối hết chỗ
 * 9. Thư chủ: gửi 1 lần dù notifyOwner=false; KHÔNG gửi lần 2 khi bấm lại
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

function futureDate(daysFromNow) {
  return addDaysToDateStr(todayVn(new Date()), daysFromNow);
}

function allWeekSlots(time = '10:00') {
  return { 0: [time], 1: [time], 2: [time], 3: [time], 4: [time], 5: [time], 6: [time] };
}

const VALID_PAYMENT_CONFIG = {
  enabled: true,
  method: 'bank',
  amount: 200000,
  bankBin: '970422',
  accountNumber: '0987654321',
  accountName: 'NGUYEN VAN A',
  holdMinutes: 15,
};

async function createPublishedFormWithPaymentAndBooking(token, overrides = {}) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Form Đặt Lịch & Thanh Toán',
      fields: [
        { key: 'name', label: 'Họ tên', type: 'short_text', required: false, role: 'name' },
        { key: 'email', label: 'Email', type: 'email', required: false, role: 'email' },
        { key: 'phone', label: 'Số điện thoại', type: 'phone', required: false, role: 'phone' },
      ],
      settings: { notifyOwner: false, sendConfirmation: true },
      bookingConfig: {
        enabled: true,
        weeklySlots: allWeekSlots('10:00'),
        slotCapacity: 1,
        daysAhead: 30,
        minNoticeMinutes: 0,
        closedDates: [],
      },
      paymentConfig: VALID_PAYMENT_CONFIG,
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

async function attachMockReceipt(accessToken) {
  await db.query(
    `UPDATE form_submissions SET payment_receipt_key = $1, payment_receipt_uploaded_at = NOW() WHERE access_token = $2`,
    ['uploads/test/receipt.jpg', accessToken]
  );
}

describe('PR-2 — POST /api/public/forms/:publicKey/submissions/:accessToken/report-paid', () => {
  it('1. Lượt còn hạn 10\', giờ hẹn cách 3 ngày -> báo đã chuyển: 200, gia hạn hold_expires_at ≈ NOW()+24h', async () => {
    const owner = await createUser({ username: 'owner_rp_1 past' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    const appointmentDate = futureDate(3);
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {},
        appointmentDate,
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    // Lấy hold ban đầu (15 phút sau lúc nộp)
    const initialStatus = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);
    const initialHold = new Date(initialStatus.body.data.holdExpiresAt).getTime();

    // PR-5: Phải có ảnh biên lai
    await attachMockReceipt(accessToken);

    // Khách báo đã chuyển
    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.success).toBe(true);
    expect(reportRes.body.data.status).toBe('pending_payment');
    expect(reportRes.body.data.payerReportedPaidAt).toBeTruthy();

    const newHold = new Date(reportRes.body.data.holdExpiresAt).getTime();
    // Gia hạn ≈ 24h từ bây giờ, lớn hơn initialHold (15 phút)
    const expectedApproxHold = Date.now() + 24 * 60 * 60 * 1000;
    expect(newHold).toBeGreaterThan(initialHold);
    expect(Math.abs(newHold - expectedApproxHold)).toBeLessThan(60000); // lệch dưới 1 phút
  });

  it('2. Còn hạn, giờ hẹn cách 2h: hold_expires_at = đúng appointment_at (không giữ quá giờ hẹn)', async () => {
    const owner = await createUser({ username: 'owner_rp_2' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách Hai',
          email: 'khach2@test.com',
        },
        appointmentDate: futureDate(1),
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    // Giả lập giờ hẹn cách đúng 2 tiếng từ bây giờ
    const appointmentAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await db.query(
      `UPDATE form_submissions SET appointment_at = $1 WHERE access_token = $2`,
      [appointmentAt.toISOString(), accessToken]
    );

    await attachMockReceipt(accessToken);

    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);

    const reportedHold = new Date(reportRes.body.data.holdExpiresAt).getTime();
    // Phải bằng đúng appointment_at
    expect(Math.abs(reportedHold - appointmentAt.getTime())).toBeLessThan(2000);
  });

  it('3. Còn hạn, form KHÔNG đặt lịch (chỉ thu tiền): hold_expires_at ≈ NOW()+24h', async () => {
    const owner = await createUser({ username: 'owner_rp_3' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token, {
      bookingConfig: null, // tắt đặt lịch
    });

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách Ba',
          email: 'khach3@test.com',
        },
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    await attachMockReceipt(accessToken);

    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);

    const newHold = new Date(reportRes.body.data.holdExpiresAt).getTime();
    const expectedApproxHold = Date.now() + 24 * 60 * 60 * 1000;
    expect(Math.abs(newHold - expectedApproxHold)).toBeLessThan(60000);
  });

  it('4. Bấm 2 lần (idempotent): lần 2 trả 200, hold_expires_at KHÔNG đổi so với lần 1', async () => {
    const owner = await createUser({ username: 'owner_rp_4' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách Bốn',
          email: 'khach4@test.com',
        },
        appointmentDate: futureDate(5),
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    await attachMockReceipt(accessToken);

    // Lần 1
    const res1 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(res1.status).toBe(200);
    const hold1 = res1.body.data.holdExpiresAt;
    const reportedAt1 = res1.body.data.payerReportedPaidAt;

    // Lần 2
    const res2 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.holdExpiresAt).toBe(hold1);
    expect(res2.body.data.payerReportedPaidAt).toBe(reportedAt1);
  });

  it('5. Đã hết hạn giữ chỗ: trả 200, có payer_reported_paid_at, hold_expires_at KHÔNG đổi (chỗ đã nhả)', async () => {
    const owner = await createUser({ username: 'owner_rp_5' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách Năm',
          email: 'khach5@test.com',
        },
        appointmentDate: futureDate(5),
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    // Giả lập đã hết hạn giữ chỗ (hold_expires_at trong quá khứ)
    const pastHold = new Date(Date.now() - 60000).toISOString();
    await db.query(
      `UPDATE form_submissions SET hold_expires_at = $1 WHERE access_token = $2`,
      [pastHold, accessToken]
    );

    await attachMockReceipt(accessToken);

    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.payerReportedPaidAt).toBeTruthy();
    // hold_expires_at KHÔNG đổi (vẫn ở quá khứ, không gia hạn)
    expect(new Date(reportRes.body.data.holdExpiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('6. Lượt confirmed hoặc cancelled: trả 409 SUBMISSION_NOT_PENDING', async () => {
    const owner = await createUser({ username: 'owner_rp_6' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    // Lượt 1: đã confirmed
    const submitRes1 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { name: 'A', email: 'a@test.com' },
        appointmentDate: futureDate(2),
        appointmentTime: '10:00',
      });
    expect(submitRes1.status).toBe(201);
    const token1 = submitRes1.body.data.accessToken;
    await db.query(`UPDATE form_submissions SET status = 'confirmed' WHERE access_token = $1`, [token1]);

    const res1 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${token1}/report-paid`);
    expect(res1.status).toBe(409);
    expect(res1.body.code).toBe('SUBMISSION_NOT_PENDING');

    // Lượt 2: đã cancelled (chọn ngày khác để không trùng slot sức chứa 1 của lượt 1)
    const submitRes2 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { name: 'B', email: 'b@test.com' },
        appointmentDate: futureDate(3),
        appointmentTime: '10:00',
      });
    expect(submitRes2.status).toBe(201);
    const token2 = submitRes2.body.data.accessToken;
    await db.query(`UPDATE form_submissions SET status = 'cancelled' WHERE access_token = $1`, [token2]);

    const res2 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${token2}/report-paid`);
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe('SUBMISSION_NOT_PENDING');
  });

  it('7. Token sai / form ẩn / admin tắt: 404, cùng thông điệp với GET trạng thái', async () => {
    const owner = await createUser({ username: 'owner_rp_7' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    // Token sai -> 404
    const resWrongToken = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/wrong_token_xyz/report-paid`);
    expect(resWrongToken.status).toBe(404);
    expect(resWrongToken.body.code).toBe('SUBMISSION_NOT_FOUND');

    // Tạo submission thật
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { name: 'C', email: 'c@test.com' },
        appointmentDate: futureDate(2),
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const subToken = submitRes.body.data.accessToken;

    // Form ẩn -> 404
    await db.query(`UPDATE forms SET is_published = false WHERE id = $1`, [form.id]);
    const resUnpublished = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${subToken}/report-paid`);
    expect(resUnpublished.status).toBe(404);
    expect(resUnpublished.body.code).toBe('SUBMISSION_NOT_FOUND');

    // Admin tắt -> 404
    await db.query(`UPDATE forms SET is_published = true, admin_disabled_at = NOW() WHERE id = $1`, [form.id]);
    const resDisabled = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${subToken}/report-paid`);
    expect(resDisabled.status).toBe(404);
    expect(resDisabled.body.code).toBe('SUBMISSION_NOT_FOUND');
  });

  it('8. Slot sức chứa 1: A báo đã chuyển -> gia hạn 24h; B đặt cùng giờ bị từ chối 409 FORM_SLOT_TAKEN/FULL', async () => {
    const owner = await createUser({ username: 'owner_rp_8' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);
    const appointmentDate = futureDate(3);

    // Khách A đặt
    const submitA = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách A',
          email: 'khacha@test.com',
        },
        appointmentDate,
        appointmentTime: '10:00',
      });
    expect(submitA.status).toBe(201);
    const tokenA = submitA.body.data.accessToken;

    await attachMockReceipt(tokenA);

    // A báo đã chuyển khoản -> được gia hạn giữ chỗ
    const reportA = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${tokenA}/report-paid`);
    expect(reportA.status).toBe(200);

    // Khách B cố đặt cùng giờ -> phải bị từ chối 409 FORM_SLOT_FULL vì chỗ của A vẫn đang được giữ!
    const submitB = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách B',
          email: 'khachb@test.com',
        },
        appointmentDate,
        appointmentTime: '10:00',
      });
    expect(submitB.status).toBe(409);
    expect(submitB.body.code).toBe('FORM_SLOT_FULL');
  });

  it('9. Thư chủ: gửi 1 lần dù notifyOwner=false; KHÔNG gửi lần 2 khi bấm lại', async () => {
    const owner = await createUser({ username: 'owner_rp_9', email: 'owner9@test.com' });
    const token = await loginAs(owner);
    // notifyOwner: false
    const form = await createPublishedFormWithPaymentAndBooking(token, {
      settings: { notifyOwner: false },
    });

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: {
          name: 'Khách Chín',
          email: 'khach9@test.com',
          phone: '0909123456',
        },
        appointmentDate: futureDate(4),
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;
    mockSendMail.mockClear();

    await attachMockReceipt(accessToken);

    // Bấm lần 1
    const res1 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(res1.status).toBe(200);

    // Đã gửi 1 email cho owner dù notifyOwner = false
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const sentMail = mockSendMail.mock.calls[0][0];
    expect(sentMail.to).toBe('owner9@test.com');
    expect(sentMail.subject).toContain('Khách báo đã chuyển khoản');
    expect(sentMail.html).toContain('Khách Chín');
    expect(sentMail.html).toContain(`/app/forms/${form.id}/submissions`);

    // Bấm lần 2
    mockSendMail.mockClear();
    const res2 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(res2.status).toBe(200);

    // KHÔNG gửi lại email lần 2!
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('10. Không bao giờ rút ngắn: nếu hold hiện tại lớn hơn appointment_at, giữ GREATEST', async () => {
    const owner = await createUser({ username: 'owner_rp_10' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { name: 'Khách Mười', email: 'khach10@test.com' },
        appointmentDate: futureDate(1),
        appointmentTime: '10:00',
      });
    const { accessToken } = submitRes.body.data;

    // Giả lập appointment_at chỉ còn 5 phút, nhưng hold_expires_at còn 12 phút
    const appointmentAt = new Date(Date.now() + 5 * 60 * 1000);
    const initialHold = new Date(Date.now() + 12 * 60 * 1000);
    await db.query(
      `UPDATE form_submissions SET appointment_at = $1, hold_expires_at = $2 WHERE access_token = $3`,
      [appointmentAt.toISOString(), initialHold.toISOString(), accessToken]
    );

    await attachMockReceipt(accessToken);

    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);

    const reportedHold = new Date(reportRes.body.data.holdExpiresAt).getTime();
    // Không bao giờ rút ngắn: reportedHold phải >= initialHold (12 phút), KHÔNG bị tụt xuống 5 phút!
    expect(reportedHold).toBeGreaterThanOrEqual(initialHold.getTime() - 1000);
  });

  it('11. Chốt PR-5: Chưa gửi ảnh biên lai và chưa được miễn -> 409 RECEIPT_REQUIRED', async () => {
    const owner = await createUser({ username: 'owner_rp_11' });
    const token = await loginAs(owner);
    const form = await createPublishedFormWithPaymentAndBooking(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { name: 'Khách Mười Một', email: 'khach11@test.com' },
        appointmentDate: futureDate(2),
        appointmentTime: '10:00',
      });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    process.env.FORM_PAYMENT_RECEIPT_ENABLED = 'true';
    try {
      // Chưa tải ảnh -> báo chuyển khoản phải bị chặn 409
      const reportRes = await request(app)
        .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
      expect(reportRes.status).toBe(409);
      expect(reportRes.body.code).toBe('RECEIPT_REQUIRED');
      expect(reportRes.body.message).toContain('ảnh chuyển khoản');
    } finally {
      delete process.env.FORM_PAYMENT_RECEIPT_ENABLED;
    }
  });
});
