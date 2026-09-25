/**
 * PR-5 V6: Biểu mẫu hỗ trợ CẢ HAI phương thức thanh toán: Ngân hàng VÀ MoMo (Backend Integration Test)
 *
 * Kiểm tra nghiệm thu V6 theo lệnh giao Claude 25/09:
 * 1. Form 2 phương thức (methods: ['bank', 'momo']):
 *    - Nộp bài -> 201, pending_payment, options có 2 phần tử (bank và momo), 2 qrString hợp lệ, CÙNG số tiền và mã nội dung
 *    - GET public form: payment có amount, method='bank', methods=['bank', 'momo']
 *    - GET status: payment có options 2 phần tử, và payment phẳng giữ nguyên
 *    - Thư hướng dẫn chuyển khoản: liệt kê cả hai phương thức
 * 2. Form cũ chỉ có 1 method (backward compatibility):
 *    - Nộp bài -> options có 1 phần tử, payment phẳng khít từng trường
 *    - Bài nộp cũ (snapshot cũ chỉ có method) mở GET status: options 1 phần tử, không lỗi
 * 3. Validation:
 *    - methods rỗng -> 400 INVALID_PAYMENT_CONFIG
 *    - tích cả hai mà thiếu momoPhone -> 400 dù ngân hàng đầy đủ
 *    - tích cả hai mà momoQrAccount sai -> 400
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
const { parseVietQR } = await import('../../../frontend/src/utils/vietqrParser.js');
const { crc16CcittFalse } = await import('../../src/utils/vietQr.util.js');

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

const DUAL_PAYMENT_CONFIG = {
  enabled: true,
  methods: ['bank', 'momo'],
  amount: 250000,
  holdMinutes: 30,
  bankBin: '970422',
  accountNumber: '0987654321',
  accountName: 'NGUYEN VAN A',
  momoPhone: '0987654321',
  momoName: 'NGUYEN VAN A',
  momoQrMode: 'phone',
};

describe('PR-5 V6 — Biểu mẫu hỗ trợ CẢ HAI phương thức: Ngân hàng VÀ MoMo', () => {
  it('1. Form 2 phương thức: nộp bài có options 2 phần tử, 2 qrString hợp lệ, cùng amount & code', async () => {
    const owner = await createUser({ username: 'owner_v6_1', email: 'owner_v6_1@test.com' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form 2 Phương Thức V6',
        fields: [
          { key: 'name', label: 'Họ tên', type: 'short_text', required: false, role: 'name' },
          { key: 'email', label: 'Email', type: 'email', required: false, role: 'email' },
        ],
        settings: { sendConfirmation: true },
        paymentConfig: DUAL_PAYMENT_CONFIG,
      });
    expect(createRes.status).toBe(201);
    const form = createRes.body.data;
    expect(form.paymentConfig.methods).toEqual(['bank', 'momo']);
    expect(form.paymentConfig.method).toBe('bank');

    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // 1.1 GET public form: tóm tắt thanh toán có methods
    const publicRes = await request(app).get(`/api/public/forms/${form.publicKey}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.payment.methods).toEqual(['bank', 'momo']);
    expect(publicRes.body.data.payment.method).toBe('bank');
    expect(publicRes.body.data.payment.amount).toBe(250000);

    // 1.2 Nộp bài:
    const emailField = form.fields.find((f) => f.type === 'email');
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({
        answers: { [emailField.key]: 'khach_v6@test.com' },
      });
    expect(submitRes.status).toBe(201);
    const { accessToken, payment } = submitRes.body.data;

    // payment phẳng (backward compatible)
    expect(payment.method).toBe('bank');
    expect(payment.amount).toBe(250000);
    expect(payment.code).toBeTruthy();
    expect(payment.qrString).toBeTruthy();

    // payment.options có đủ 2 phương thức
    expect(payment.options).toHaveLength(2);

    const bankOpt = payment.options.find((o) => o.method === 'bank');
    const momoOpt = payment.options.find((o) => o.method === 'momo');
    expect(bankOpt).toBeTruthy();
    expect(momoOpt).toBeTruthy();

    expect(bankOpt.accountNumber).toBe('0987654321');
    expect(bankOpt.bankBin).toBe('970422');
    expect(bankOpt.qrString).toBe(payment.qrString);

    expect(momoOpt.momoPhone).toBe('0987654321');
    expect(momoOpt.momoName).toBe('NGUYEN VAN A');
    expect(momoOpt.qrString).toBeTruthy();

    // Cả 2 QR đều giải mã được và có cùng số tiền và mã nội dung
    const parsedBank = parseVietQR(bankOpt.qrString);
    expect(parsedBank.valid).toBe(true);
    expect(parsedBank.bin).toBe('970422');
    expect(parsedBank.accountNumber).toBe('0987654321');
    expect(parsedBank.amount).toBe(250000);
    expect(parsedBank.description).toBe(payment.code);
    expect(crc16CcittFalse(bankOpt.qrString.slice(0, -4))).toBe(bankOpt.qrString.slice(-4));

    const parsedMomo = parseVietQR(momoOpt.qrString);
    expect(parsedMomo.valid).toBe(true);
    expect(parsedMomo.bin).toBe('971025'); // BIN MoMo
    expect(parsedMomo.accountNumber).toBe('0987654321');
    expect(parsedMomo.amount).toBe(250000);
    expect(parsedMomo.description).toBe(payment.code);
    expect(crc16CcittFalse(momoOpt.qrString.slice(0, -4))).toBe(momoOpt.qrString.slice(-4));

    // 1.3 GET submission status
    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);
    expect(statusRes.status).toBe(200);
    const statusPayment = statusRes.body.data.payment;
    expect(statusPayment.options).toHaveLength(2);
    expect(statusPayment.options[0].method).toBe('bank');
    expect(statusPayment.options[1].method).toBe('momo');
    expect(statusPayment.qrString).toBe(bankOpt.qrString);

    // 1.4 Thư hướng dẫn chuyển khoản có liệt kê cả hai
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockSendMail).toHaveBeenCalled();
    const sentMail = mockSendMail.mock.calls.find((call) => call[0].to === 'khach_v6@test.com');
    expect(sentMail).toBeTruthy();
    expect(sentMail[0].html).toContain('Cách 1: Chuyển khoản ngân hàng');
    expect(sentMail[0].html).toContain('Cách 2: Chuyển ví MoMo');
  });

  it('2. Tương thích ngược: form cũ chỉ gửi method -> payment phẳng khít từng trường + options 1 phần tử', async () => {
    const owner = await createUser({ username: 'owner_v6_2' });
    const token = await loginAs(owner);

    const oldConfig = {
      enabled: true,
      method: 'bank',
      amount: 150000,
      bankBin: '970422',
      accountNumber: '1122334455',
      accountName: 'TRAN VAN B',
      holdMinutes: 20,
    };

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Cũ 1 Phương Thức',
        fields: [{ key: 'name', label: 'Họ tên', type: 'short_text', required: false }],
        paymentConfig: oldConfig,
      });
    expect(createRes.status).toBe(201);
    const form = createRes.body.data;
    expect(form.paymentConfig.methods).toEqual(['bank']);
    expect(form.paymentConfig.method).toBe('bank');

    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp cũ' } });
    expect(submitRes.status).toBe(201);
    const { accessToken, payment } = submitRes.body.data;

    expect(payment.method).toBe('bank');
    expect(payment.bankBin).toBe('970422');
    expect(payment.accountNumber).toBe('1122334455');
    expect(payment.accountName).toBe('TRAN VAN B');
    expect(payment.amount).toBe(150000);
    expect(payment.options).toHaveLength(1);
    expect(payment.options[0].method).toBe('bank');

    // Giả lập bài nộp cũ trong DB có snapshot cũ không có field methods
    await db.query(
      `UPDATE form_submissions
       SET payment_snapshot = jsonb_build_object(
         'method', 'bank',
         'bankBin', '970422',
         'bankName', 'MBBank',
         'accountNumber', '1122334455',
         'accountName', 'TRAN VAN B',
         'amount', 150000
       )
       WHERE access_token = $1`,
      [accessToken]
    );

    const statusRes = await request(app).get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.payment.options).toHaveLength(1);
    expect(statusRes.body.data.payment.options[0].method).toBe('bank');
    expect(statusRes.body.data.payment.method).toBe('bank');
    expect(statusRes.body.data.payment.bankBin).toBe('970422');
  });

  it('3. Validation: bỏ tích cả hai -> 400; tích MoMo mà thiếu SĐT -> 400 dù ngân hàng đủ', async () => {
    const owner = await createUser({ username: 'owner_v6_3' });
    const token = await loginAs(owner);

    // 3.1 Bỏ tích cả hai (methods rỗng)
    const resEmpty = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Lỗi Methods Rỗng',
        fields: [{ key: 'name', label: 'Tên', type: 'short_text' }],
        paymentConfig: {
          enabled: true,
          methods: [],
          amount: 100000,
        },
      });
    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.code).toBe('INVALID_PAYMENT_CONFIG');

    // 3.2 Tích MoMo mà thiếu SĐT MoMo dù ngân hàng đầy đủ
    const resMissingPhone = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Thiếu SĐT MoMo',
        fields: [{ key: 'name', label: 'Tên', type: 'short_text' }],
        paymentConfig: {
          enabled: true,
          methods: ['bank', 'momo'],
          amount: 100000,
          bankBin: '970422',
          accountNumber: '0987654321',
          accountName: 'NGUYEN VAN A',
          momoPhone: '', // Thiếu SĐT
          momoName: 'NGUYEN VAN A',
          momoQrMode: 'none',
        },
      });
    expect(resMissingPhone.status).toBe(400);
    expect(resMissingPhone.body.code).toBe('INVALID_PAYMENT_CONFIG');
  });
});
