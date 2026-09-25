/**
 * PR-5: Ảnh chuyển khoản BẮT BUỘC trước khi bấm "Tôi xác nhận đã chuyển khoản" (Backend Integration Test)
 *
 * Kiểm tra đầy đủ bảng nghiệm thu PR-5 theo lệnh giao:
 * 1. Chưa tải ảnh: gọi thẳng API report-paid -> 409 RECEIPT_REQUIRED
 * 2. Tải ảnh JPEG/PNG hợp lệ <= 2 MB: lưu thành công, GET status trả hasReceipt=true, report-paid thành công
 * 3. Tệp .jpg thật ra là PDF/HTML (sai magic bytes) -> 400 INVALID_IMAGE_TYPE
 * 4. Tải ảnh quá 2 MB -> 400 FILE_TOO_LARGE
 * 5. Tải lần thứ 6 -> 409 RECEIPT_UPLOAD_LIMIT_EXCEEDED
 * 6. Đổi ảnh (tải lại) -> object cũ bị xoá khỏi storage backend
 * 7. Chủ form hết dung lượng -> bắt StorageQuotaExceededError, không lưu ảnh, waived_reason='owner_storage_full', trả 200, report-paid thành công
 * 8. Đã báo đã chuyển rồi mà tải ảnh -> 409 PAYMENT_ALREADY_REPORTED
 * 9. GET /api/forms/:id/submissions/:submissionId/receipt:
 *    - Không đăng nhập: 401
 *    - User của workspace khác: 404
 *    - Chủ workspace: 200 stream ảnh, header Cache-Control: private, no-store
 * 10. Thư báo chủ form: có ghi chú về ảnh chuyển khoản
 * 11. Xoá form -> CASCADE xoá submission -> isReferenceAlive trả alive: false
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
const { getStorageBackend } = await import('../../src/services/storage/storageBackend.js');
const { isReferenceAlive } = await import('../../src/services/storage/storageReference.service.js');
const storageObjectService = await import('../../src/services/storage/storageObject.service.js');
const { StorageQuotaExceededError } = await import('../../src/services/storage/storageQuota.service.js');

let app;

// Sample valid buffers
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
const FAKE_PDF_AS_JPG = Buffer.from('%PDF-1.4 Fake PDF file content');

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

const VALID_PAYMENT_CONFIG = {
  enabled: true,
  method: 'bank',
  amount: 200000,
  bankBin: '970422',
  accountNumber: '0987654321',
  accountName: 'NGUYEN VAN A',
  holdMinutes: 30,
};

async function createPublishedPaymentForm(token) {
  const createRes = await request(app)
    .post('/api/forms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Form Nhận Biên Lai PR-5',
      fields: [
        { key: 'name', label: 'Họ tên', type: 'short_text', required: false, role: 'name' },
        { key: 'email', label: 'Email', type: 'email', required: false, role: 'email' },
      ],
      settings: { notifyOwner: true },
      paymentConfig: VALID_PAYMENT_CONFIG,
    });
  expect(createRes.status).toBe(201);
  const form = createRes.body.data;
  await request(app)
    .put(`/api/forms/${form.id}/publish`)
    .set('Authorization', `Bearer ${token}`)
    .send({ isPublished: true });
  return form;
}

describe('PR-5 — Ảnh chuyển khoản BẮT BUỘC trước khi xác nhận đã chuyển', () => {
  it('1. Chưa tải ảnh: gọi thẳng report-paid -> 409 RECEIPT_REQUIRED', async () => {
    const owner = await createUser({ username: 'owner_p5_1' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 1' } });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    // Chưa tải ảnh
    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(409);
    expect(reportRes.body.code).toBe('RECEIPT_REQUIRED');
  });

  it('2. Tải ảnh JPEG hợp lệ: lưu thành công, status trả hasReceipt=true, report-paid 200', async () => {
    const owner = await createUser({ username: 'owner_p5_2' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 2' } });
    expect(submitRes.status).toBe(201);
    const { accessToken } = submitRes.body.data;

    // Upload receipt
    const uploadRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'bien-lai.jpg', contentType: 'image/jpeg' });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.receiptStored).toBe(true);

    // GET status kiểm tra hasReceipt
    const statusRes = await request(app)
      .get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.hasReceipt).toBe(true);
    expect(statusRes.body.data.receiptWaived).toBe(false);
    expect(statusRes.body.data.paymentReceiptKey).toBeUndefined(); // Không lộ storage key

    // Báo đã chuyển -> 200
    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.payerReportedPaidAt).toBeTruthy();
  });

  it('3. Tệp .jpg thật ra là PDF (magic bytes giả mạo) -> 400 INVALID_IMAGE_TYPE', async () => {
    const owner = await createUser({ username: 'owner_p5_3' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 3' } });
    const { accessToken } = submitRes.body.data;

    const uploadRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', FAKE_PDF_AS_JPG, { filename: 'gia-mao.jpg', contentType: 'image/jpeg' });
    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.code).toBe('INVALID_IMAGE_TYPE');
  });

  it('4. Tải ảnh quá 2 MB -> 400 FILE_TOO_LARGE', async () => {
    const owner = await createUser({ username: 'owner_p5_4' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 4' } });
    const { accessToken } = submitRes.body.data;

    // Tạo buffer JPEG 2.5 MB
    const largeBuffer = Buffer.concat([JPEG_HEADER, Buffer.alloc(2.5 * 1024 * 1024)]);
    const uploadRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', largeBuffer, { filename: 'large.jpg', contentType: 'image/jpeg' });
    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.code).toBe('FILE_TOO_LARGE');
  });

  it('5. Tải lần thứ 6 -> 409 RECEIPT_UPLOAD_LIMIT_EXCEEDED', async () => {
    const owner = await createUser({ username: 'owner_p5_5' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 5' } });
    const { accessToken } = submitRes.body.data;

    // Tải 5 lần liên tiếp
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
        .attach('file', JPEG_HEADER, { filename: `receipt-${i}.jpg`, contentType: 'image/jpeg' });
      expect(res.status).toBe(200);
    }

    // Lần thứ 6 -> bị từ chối
    const res6 = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'receipt-6.jpg', contentType: 'image/jpeg' });
    expect(res6.status).toBe(409);
    expect(res6.body.code).toBe('RECEIPT_UPLOAD_LIMIT_EXCEEDED');
  });

  it('6. Đổi ảnh: object cũ trong kho bị xoá khi tải ảnh mới', async () => {
    const owner = await createUser({ username: 'owner_p5_6' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 6' } });
    const { accessToken } = submitRes.body.data;

    // Lần 1
    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'first.jpg', contentType: 'image/jpeg' });

    const row1 = await db.query(
      `SELECT payment_receipt_key FROM form_submissions WHERE access_token = $1`,
      [accessToken]
    );
    const key1 = row1.rows[0].payment_receipt_key;
    expect(key1).toBeTruthy();
    expect(await getStorageBackend().exists(key1)).toBe(true);

    // Lần 2 (Đổi ảnh)
    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', PNG_HEADER, { filename: 'second.png', contentType: 'image/png' });

    const row2 = await db.query(
      `SELECT payment_receipt_key FROM form_submissions WHERE access_token = $1`,
      [accessToken]
    );
    const key2 = row2.rows[0].payment_receipt_key;
    expect(key2).toBeTruthy();
    expect(key2).not.toBe(key1);
    expect(await getStorageBackend().exists(key2)).toBe(true);

    // File cũ (key1) phải bị xoá khỏi storage backend
    expect(await getStorageBackend().exists(key1)).toBe(false);
  });

  it('7. Chủ form hết dung lượng: bắt StorageQuotaExceededError, không lưu ảnh, waived_reason="owner_storage_full", nút mở và report-paid 200', async () => {
    const owner = await createUser({ username: 'owner_p5_7' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 7' } });
    const { accessToken } = submitRes.body.data;

    // Giả lập chủ hết dung lượng lưu trữ (StorageQuotaExceededError thật)
    process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    await db.query(`UPDATE users SET storage_quota_override_bytes = 1 WHERE id = $1`, [owner.id]);
    await db.query(
      `INSERT INTO storage_objects (pool_type, owner_user_id, storage_key, category, state, size_bytes)
       VALUES ('workspace', $1, 'dummy_key_full', 'form_receipt', 'active', 10)`,
      [owner.id]
    );

    let uploadRes;
    try {
      uploadRes = await request(app)
        .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
        .attach('file', JPEG_HEADER, { filename: 'bien-lai.jpg', contentType: 'image/jpeg' });
    } finally {
      delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
    }

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.receiptStored).toBe(false);
    expect(uploadRes.body.data.reason).toBe('OWNER_STORAGE_FULL');

    // GET status kiểm tra receiptWaived
    const statusRes = await request(app)
      .get(`/api/public/forms/${form.publicKey}/submissions/${accessToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.hasReceipt).toBe(false);
    expect(statusRes.body.data.receiptWaived).toBe(true);

    // Khách vẫn có thể bấm xác nhận chuyển khoản thành công -> 200
    const reportRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.payerReportedPaidAt).toBeTruthy();
  });

  it('8. Đã báo đã chuyển rồi mà tải ảnh -> 409 PAYMENT_ALREADY_REPORTED', async () => {
    const owner = await createUser({ username: 'owner_p5_8' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 8' } });
    const { accessToken } = submitRes.body.data;

    // Tải ảnh lần đầu
    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'first.jpg', contentType: 'image/jpeg' });

    // Báo đã chuyển
    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);

    // Cố tải ảnh tiếp sau khi đã báo -> bị khoá 409
    const uploadRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', PNG_HEADER, { filename: 'after.png', contentType: 'image/png' });
    expect(uploadRes.status).toBe(409);
    expect(uploadRes.body.code).toBe('PAYMENT_ALREADY_REPORTED');
  });

  it('9. GET /api/forms/:id/submissions/:submissionId/receipt: bảo mật phân quyền & stream ảnh', async () => {
    const ownerA = await createUser({ username: 'owner_p5_9a' });
    const tokenA = await loginAs(ownerA);
    const formA = await createPublishedPaymentForm(tokenA);

    const ownerB = await createUser({ username: 'owner_p5_9b' });
    const tokenB = await loginAs(ownerB);

    const submitRes = await request(app)
      .post(`/api/public/forms/${formA.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 9' } });
    const { accessToken } = submitRes.body.data;

    await request(app)
      .post(`/api/public/forms/${formA.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'receipt.jpg', contentType: 'image/jpeg' });

    const subRow = await db.query(
      `SELECT id FROM form_submissions WHERE access_token = $1`,
      [accessToken]
    );
    const submissionId = subRow.rows[0].id;

    // 1. Không có token -> 401
    const resNoAuth = await request(app)
      .get(`/api/forms/${formA.id}/submissions/${submissionId}/receipt`);
    expect(resNoAuth.status).toBe(401);

    // 2. User B (chủ workspace khác) truy cập form của A -> 404 (chống IDOR)
    const resForbidden = await request(app)
      .get(`/api/forms/${formA.id}/submissions/${submissionId}/receipt`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resForbidden.status).toBe(404);

    // 3. User A (chủ form) -> 200, stream đúng file, header Cache-Control: private, no-store
    const resOk = await request(app)
      .get(`/api/forms/${formA.id}/submissions/${submissionId}/receipt`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resOk.status).toBe(200);
    expect(resOk.headers['cache-control']).toBe('private, no-store');
    expect(resOk.body).toEqual(JPEG_HEADER);
  });

  it('10. Thư báo chủ form: có dòng ghi chú về ảnh chuyển khoản', async () => {
    const owner = await createUser({ username: 'owner_p5_10', email: 'owner10@test.com' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Khách Mười' } });
    const { accessToken } = submitRes.body.data;

    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'receipt.jpg', contentType: 'image/jpeg' });

    mockSendMail.mockClear();

    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/report-paid`);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const sentMail = mockSendMail.mock.calls[0][0];
    expect(sentMail.html).toContain('Khách đã gửi ảnh chuyển khoản');
    expect(sentMail.html).toContain('xem ở trang Bài nộp');
  });

  it('11. Xoá form -> CASCADE xoá submission -> isReferenceAlive trả alive: false', async () => {
    const owner = await createUser({ username: 'owner_p5_11' });
    const token = await loginAs(owner);
    const form = await createPublishedPaymentForm(token);

    const submitRes = await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions`)
      .send({ answers: { name: 'Người nộp 11' } });
    const { accessToken } = submitRes.body.data;

    await request(app)
      .post(`/api/public/forms/${form.publicKey}/submissions/${accessToken}/receipt`)
      .attach('file', JPEG_HEADER, { filename: 'receipt.jpg', contentType: 'image/jpeg' });

    const subRow = await db.query(
      `SELECT id FROM form_submissions WHERE access_token = $1`,
      [accessToken]
    );
    const submissionId = subRow.rows[0].id;

    // Lúc form còn tồn tại
    const aliveBefore = await isReferenceAlive('form_payment_receipt', submissionId);
    expect(aliveBefore.alive).toBe(true);

    // Xoá form
    await request(app)
      .delete(`/api/forms/${form.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Sau khi xoá form -> CASCADE xoá submission -> isReferenceAlive trả alive: false
    const aliveAfter = await isReferenceAlive('form_payment_receipt', submissionId);
    expect(aliveAfter.alive).toBe(false);
  });
});
