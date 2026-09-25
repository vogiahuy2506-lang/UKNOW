/**
 * PR-3: QR MoMo từ ảnh "QR Nhận Tiền Đa Năng" (Backend Integration Test)
 *
 * Kiểm tra:
 * 1. Validate paymentConfig MoMo với momoQrBin, momoQrAccount, momoQrRefLabel
 * 2. Lưu paymentSnapshot có momoQrBin, momoQrAccount
 * 3. Sinh qrString VietQR động chuẩn Napas khi nộp form và khi tra cứu trạng thái
 * 4. Backward-compatible: Form MoMo không có QR trả qrString = null
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

describe('PR-3 — QR MoMo từ ảnh QR Đa Năng (Backend)', () => {
  it('1. Tạo form MoMo với momoQrBin, momoQrAccount, momoQrRefLabel hợp lệ -> 201 thành công', async () => {
    const owner = await createUser({ username: 'owner_momo_1' });
    const token = await loginAs(owner);

    const res = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form MoMo QR Test',
        fields: [{ label: 'Email', type: 'email', required: false }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 2000,
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          momoQrBin: '971025',
          momoQrAccount: 'PSP2604014212340493',
          momoQrRefLabel: 'MOMOW2W6128717X',
          holdMinutes: 30,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.paymentConfig).toMatchObject({
      enabled: true,
      method: 'momo',
      amount: 2000,
      momoPhone: '0912345678',
      momoName: 'NGUYEN VAN A',
      momoQrBin: '971025',
      momoQrAccount: 'PSP2604014212340493',
      momoQrRefLabel: 'MOMOW2W6128717X',
    });
  });

  it('2. Bẫy validation: chỉ có momoQrBin mà thiếu momoQrAccount (hoặc ngược lại) -> 400', async () => {
    const owner = await createUser({ username: 'owner_momo_2' });
    const token = await loginAs(owner);

    // Chỉ có momoQrBin
    const res1 = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Thiếu Account',
        fields: [{ label: 'Email', type: 'email' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          momoQrBin: '971025',
        },
      });
    expect(res1.status).toBe(400);
    expect(res1.body.code).toBe('INVALID_PAYMENT_CONFIG');

    // Chỉ có momoQrAccount
    const res2 = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Thiếu Bin',
        fields: [{ label: 'Email', type: 'email' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          momoQrAccount: 'PSP123456789',
        },
      });
    expect(res2.status).toBe(400);
    expect(res2.body.code).toBe('INVALID_PAYMENT_CONFIG');
  });

  it('3. Bẫy validation: momoQrBin không phải 6 số hoặc momoQrAccount chứa ký tự đặc biệt -> 400', async () => {
    const owner = await createUser({ username: 'owner_momo_3' });
    const token = await loginAs(owner);

    // BIN sai độ dài
    const resBin = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form BIN Sai',
        fields: [{ label: 'Email', type: 'email' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          momoQrBin: '97102', // 5 số
          momoQrAccount: 'PSP2604014212340493',
        },
      });
    expect(resBin.status).toBe(400);

    // Account chứa ký tự đặc biệt
    const resAccount = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form Account Sai',
        fields: [{ label: 'Email', type: 'email' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          momoQrBin: '971025',
          momoQrAccount: 'PSP-123456789!',
        },
      });
    expect(resAccount.status).toBe(400);
  });

  it('4. Khách nộp bài vào form MoMo CÓ QR: sinh qrString hợp lệ và GET status trả qrString', async () => {
    const owner = await createUser({ username: 'owner_momo_4' });
    const token = await loginAs(owner);

    // 1. Tạo form
    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form MoMo QR Live',
        fields: [{ key: 'email', label: 'Email', type: 'email', required: false, role: 'email' }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 2000,
          momoPhone: '0912345678',
          momoName: 'NGUYEN VAN A',
          momoQrBin: '971025',
          momoQrAccount: 'PSP2604014212340493',
          momoQrRefLabel: 'MOMOW2W6128717X',
          holdMinutes: 30,
        },
      });
    expect(createRes.status).toBe(201);
    const form = createRes.body.data;

    // Xuất bản
    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // 2. Khách nộp form
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { email: 'customer@test.com' } });

    expect(submitRes.status).toBe(201);
    const { accessToken, payment } = submitRes.body.data;
    const qrString = payment?.qrString;
    const paymentCode = payment?.code;

    // qrString không null và chứa BIN 971025, STK PSP2604014212340493, memo paymentCode
    expect(qrString).toBeTruthy();
    expect(qrString).toContain('971025');
    expect(qrString).toContain('PSP2604014212340493');
    expect(qrString).toContain(paymentCode);
    expect(qrString).toContain('2000'); // số tiền 2000đ

    // 3. GET submission status
    const statusRes = await request(app)
      .get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);

    expect(statusRes.status).toBe(200);
    expect(Number(statusRes.body.data.payment.amount)).toBe(2000);
    expect(statusRes.body.data.payment).toMatchObject({
      method: 'momo',
      code: paymentCode,
      momoPhone: '0912345678',
      momoName: 'NGUYEN VAN A',
      qrString: qrString,
    });
  });

  it('5. Form MoMo KHÔNG CÓ QR (dữ liệu cũ): qrString trả về null, không vỡ luồng', async () => {
    const owner = await createUser({ username: 'owner_momo_5' });
    const token = await loginAs(owner);

    const createRes = await request(app)
      .post('/api/forms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Form MoMo Cũ Không QR',
        fields: [{ key: 'email', label: 'Email', type: 'email', required: false }],
        paymentConfig: {
          enabled: true,
          method: 'momo',
          amount: 50000,
          momoPhone: '0988888888',
          momoName: 'TRAN VAN B',
          holdMinutes: 30,
        },
      });
    expect(createRes.status).toBe(201);
    const form = createRes.body.data;

    await request(app)
      .put(`/api/forms/${form.id}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isPublished: true });

    // Khách nộp
    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: {} });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.payment.qrString).toBeNull();

    // GET status
    const statusRes = await request(app)
      .get(`/api/public/forms/${form.publicKey}/submissions/${submitRes.body.data.accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.payment.qrString).toBeNull();
    expect(statusRes.body.data.payment.momoPhone).toBe('0988888888');
  });
});
