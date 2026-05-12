/**
 * Integration tests cho `/api/verification`.
 *
 * Phạm vi:
 *   - POST /send-code:
 *       * validator email
 *       * email đã đăng ký → 400
 *       * username đã đăng ký → 400
 *       * DNS check skip với common domain (gmail/...) hoặc NODE_ENV=test
 *       * gửi qua `sendSystemEmail` (mock nodemailer)
 *       * row mới trong verification_codes; rows cũ bị mark is_used=true
 *   - POST /verify-code:
 *       * mã đúng → 200, đánh dấu is_used=true
 *       * mã sai → 400
 *       * mã đã dùng → 400
 *       * mã hết hạn → 400
 *       * validator (email/code length)
 *
 * Vì DNS check ẩn (server thật resolveMx) tốn time + flaky, test lấy
 * `gmail.com` (common domain → bypass) và `test.com` (whitelist trong code).
 *
 * `sendSystemEmail` no-op khi không có SENDGRID_API_KEY. Test này SET env
 * SENDGRID_API_KEY giả + mock nodemailer để xác minh email body có chứa mã.
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
let originalSendGridKey;

beforeAll(() => {
  app = createApp();
  originalSendGridKey = process.env.SENDGRID_API_KEY;
  process.env.SENDGRID_API_KEY = 'SG.test-key-for-verification-only';
});

afterAll(() => {
  if (originalSendGridKey === undefined) delete process.env.SENDGRID_API_KEY;
  else process.env.SENDGRID_API_KEY = originalSendGridKey;
});

beforeEach(async () => {
  await truncateAll();
  mockSendMail.mockClear();
});

describe('POST /api/verification/send-code', () => {
  it('email không hợp lệ → 400 (validator)', async () => {
    const res = await request(app)
      .post('/api/verification/send-code')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('thiếu email → 400', async () => {
    const res = await request(app).post('/api/verification/send-code').send({});
    expect(res.status).toBe(400);
  });

  it('email common domain (gmail.com) → bypass DNS check + tạo row + gửi mail', async () => {
    const res = await request(app)
      .post('/api/verification/send-code')
      .send({ email: 'newuser@gmail.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows } = await db.query(
      `SELECT email, code, type, is_used FROM verification_codes WHERE email = $1`,
      ['newuser@gmail.com']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('email_verification');
    expect(rows[0].is_used).toBe(false);
    expect(rows[0].code).toMatch(/^\d{6}$/);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const args = mockSendMail.mock.calls[0][0];
    expect(args.to).toBe('newuser@gmail.com');
    expect(args.subject).toContain('Mã xác minh');
    expect(args.html).toContain(rows[0].code);
  });

  it('email đã được sử dụng → 400 và không tạo mã mới', async () => {
    await createUser({ username: 'taken', email: 'taken@gmail.com' });

    const res = await request(app)
      .post('/api/verification/send-code')
      .send({ email: 'taken@gmail.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('đã được sử dụng');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('username đã được sử dụng → 400', async () => {
    await createUser({ username: 'dup_user', email: 'someone@gmail.com' });

    const res = await request(app)
      .post('/api/verification/send-code')
      .send({ email: 'new@gmail.com', username: 'dup_user' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Tên đăng nhập');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('gọi send-code 2 lần → mã cũ bị mark is_used=true, mã mới is_used=false', async () => {
    const email = 'reissue@gmail.com';
    const r1 = await request(app).post('/api/verification/send-code').send({ email });
    expect(r1.status).toBe(200);
    const r2 = await request(app).post('/api/verification/send-code').send({ email });
    expect(r2.status).toBe(200);

    const { rows } = await db.query(
      `SELECT code, is_used FROM verification_codes WHERE email = $1 ORDER BY created_at ASC`,
      [email]
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].is_used).toBe(true);
    expect(rows[1].is_used).toBe(false);

    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('thiếu SENDGRID_API_KEY → mã vẫn lưu DB nhưng không gọi sendMail (no-op)', async () => {
    const saved = process.env.SENDGRID_API_KEY;
    delete process.env.SENDGRID_API_KEY;

    const res = await request(app)
      .post('/api/verification/send-code')
      .send({ email: 'noapi@gmail.com' });

    expect(res.status).toBe(200);
    expect(mockSendMail).not.toHaveBeenCalled();

    const { rows } = await db.query(
      `SELECT email FROM verification_codes WHERE email = $1`,
      ['noapi@gmail.com']
    );
    expect(rows).toHaveLength(1);

    process.env.SENDGRID_API_KEY = saved;
  });
});

describe('POST /api/verification/verify-code', () => {
  /**
   * Helper: insert thẳng 1 mã verification để skip flow send.
   */
  async function insertCode({
    email,
    code = '123456',
    type = 'email_verification',
    isUsed = false,
    expiresInMinutes = 10,
  }) {
    const { rows } = await db.query(
      `INSERT INTO verification_codes (email, code, type, is_used, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 || ' minutes')::interval, NOW()) RETURNING id`,
      [email, code, type, isUsed, expiresInMinutes]
    );
    return rows[0].id;
  }

  it('mã đúng + chưa hết hạn → 200, mã được mark is_used=true', async () => {
    const email = 'ok@gmail.com';
    const id = await insertCode({ email, code: '654321' });

    const res = await request(app)
      .post('/api/verification/verify-code')
      .send({ email, code: '654321' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ email, verified: true });

    const { rows } = await db.query(
      `SELECT is_used FROM verification_codes WHERE id = $1`,
      [id]
    );
    expect(rows[0].is_used).toBe(true);
  });

  it('mã sai → 400', async () => {
    const email = 'wrong@gmail.com';
    await insertCode({ email, code: '111111' });

    const res = await request(app)
      .post('/api/verification/verify-code')
      .send({ email, code: '999999' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('không đúng');
  });

  it('mã đã dùng → 400', async () => {
    const email = 'used@gmail.com';
    await insertCode({ email, code: '222222', isUsed: true });

    const res = await request(app)
      .post('/api/verification/verify-code')
      .send({ email, code: '222222' });

    expect(res.status).toBe(400);
  });

  it('mã hết hạn → 400', async () => {
    const email = 'expired@gmail.com';
    // expires âm → đã hết hạn
    await db.query(
      `INSERT INTO verification_codes (email, code, type, is_used, expires_at)
       VALUES ($1, $2, 'email_verification', FALSE, NOW() - INTERVAL '1 minute')`,
      [email, '333333']
    );

    const res = await request(app)
      .post('/api/verification/verify-code')
      .send({ email, code: '333333' });

    expect(res.status).toBe(400);
  });

  it('code thiếu hoặc sai độ dài → 400 (validator isLength 6/6)', async () => {
    const r1 = await request(app)
      .post('/api/verification/verify-code')
      .send({ email: 'a@gmail.com', code: '123' });
    const r2 = await request(app)
      .post('/api/verification/verify-code')
      .send({ email: 'a@gmail.com', code: '1234567' });
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
  });

  it('email khác account với email gửi code → 400 (verify chỉ match đúng email)', async () => {
    await insertCode({ email: 'a@gmail.com', code: '777777' });

    const res = await request(app)
      .post('/api/verification/verify-code')
      .send({ email: 'b@gmail.com', code: '777777' });

    expect(res.status).toBe(400);
  });
});
