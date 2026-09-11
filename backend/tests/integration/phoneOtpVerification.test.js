/**
 * Integration tests cho POST /api/verification/phone/send-code và /verify (PR-1, xác thực
 * SĐT bằng OTP). Xem _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4.5, 4.9.
 *
 * Chạy với PHONE_OTP_PROVIDER=mock — không gọi mạng thật (otpProvider.service.js provider
 * mock chỉ log, không gửi SMS). Mã OTP đọc thẳng từ verification_codes trong DB vì mock
 * không trả mã ra response (đúng thiết kế — không log/trả mã OTP qua bất kỳ kênh không cần
 * thiết nào).
 *
 * Hồi quy "PHONE_OTP_PROVIDER rỗng → mọi thứ như cũ" đã có sẵn ở phoneRequired.test.js
 * (25 ca, chạy KHÔNG đặt biến này) — không lặp lại ở đây, chỉ thêm ca xác nhận riêng cho
 * hai route mới trả 404 khi tắt.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';

let app;
let originalProvider;

beforeAll(() => {
  app = createApp();
  originalProvider = process.env.PHONE_OTP_PROVIDER;
  process.env.PHONE_OTP_PROVIDER = 'mock';
});

afterAll(() => {
  if (originalProvider === undefined) delete process.env.PHONE_OTP_PROVIDER;
  else process.env.PHONE_OTP_PROVIDER = originalProvider;
});

beforeEach(async () => {
  await truncateAll();
});

async function loginToken(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  expect(res.status).toBe(200);
  return res.body.data.accessToken;
}

async function readLatestOtpCode(phone) {
  const { rows } = await db.query(
    `SELECT code FROM verification_codes
     WHERE phone = $1 AND type = 'phone_otp' AND is_used = FALSE
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  return rows[0]?.code;
}

describe('POST /api/verification/phone/send-code + /verify (provider=mock)', () => {
  it('gửi mã rồi xác thực đúng mã → 200, users.phone_verified_at có giờ', async () => {
    const user = await createUser({ username: 'otp_happy', phone: null });
    const token = await loginToken(user);

    const sendRes = await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340001' });
    expect(sendRes.status).toBe(200);

    const code = await readLatestOtpCode('0912340001');
    expect(code).toMatch(/^\d{6}$/);

    const verifyRes = await request(app)
      .post('/api/verification/phone/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340001', code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.phone).toBe('0912340001');
    expect(verifyRes.body.data.phoneVerifiedAt).toBeTruthy();

    const { rows } = await db.query('SELECT phone, phone_verified_at FROM users WHERE id = $1', [user.id]);
    expect(rows[0].phone).toBe('0912340001');
    expect(rows[0].phone_verified_at).toBeTruthy();
  });

  it('sai mã → 400 PHONE_OTP_INVALID, phone_verified_at vẫn NULL', async () => {
    const user = await createUser({ username: 'otp_wrong', phone: null });
    const token = await loginToken(user);

    await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340002' });

    const res = await request(app)
      .post('/api/verification/phone/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340002', code: '000000' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PHONE_OTP_INVALID');

    const { rows } = await db.query('SELECT phone_verified_at FROM users WHERE id = $1', [user.id]);
    expect(rows[0].phone_verified_at).toBeNull();
  });

  it('sai mã 5 lần rồi mới nhập ĐÚNG mã → vẫn bị từ chối, mã đã chết', async () => {
    const user = await createUser({ username: 'otp_locked', phone: null });
    const token = await loginToken(user);

    await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340003' });
    const code = await readLatestOtpCode('0912340003');

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const wrongRes = await request(app)
        .post('/api/verification/phone/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '0912340003', code: '111111' });
      expect(wrongRes.status).toBe(400);
    }

    const finalRes = await request(app)
      .post('/api/verification/phone/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340003', code });

    expect(finalRes.status).toBe(400);
    expect(finalRes.body.code).toBe('PHONE_OTP_INVALID');
  });

  it('gửi lại ngay trong cooldown 60s → 429 PHONE_OTP_COOLDOWN kèm retryAfterSec', async () => {
    const user = await createUser({ username: 'otp_cooldown', phone: null });
    const token = await loginToken(user);

    const first = await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340004' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340004' });

    expect(second.status).toBe(429);
    expect(second.body.code).toBe('PHONE_OTP_COOLDOWN');
    expect(second.body.retryAfterSec).toBeGreaterThan(0);
  });

  it('SĐT không hợp lệ → 400, không tạo mã', async () => {
    const user = await createUser({ username: 'otp_badphone', phone: null });
    const token = await loginToken(user);

    const res = await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123' });

    expect(res.status).toBe(400);
  });

  it('chưa đăng nhập → 401, không lộ endpoint cho khách vãng lai', async () => {
    const res = await request(app)
      .post('/api/verification/phone/send-code')
      .send({ phone: '0912340005' });

    expect(res.status).toBe(401);
  });

  describe('Luật "số đã xác thực thắng số chưa xác thực" (plan mục 2)', () => {
    it('Y giữ chỗ số S (chưa xác thực), X xác thực S → S chuyển sang X, Y mất số + audit', async () => {
      const userY = await createUser({ username: 'otp_holder_y', phone: '0912340010' });
      const userX = await createUser({ username: 'otp_verifier_x', phone: null });
      const tokenX = await loginToken(userX);

      // Xác nhận trạng thái ban đầu: Y có số, CHƯA xác thực.
      const beforeY = await db.query('SELECT phone, phone_verified_at FROM users WHERE id = $1', [userY.id]);
      expect(beforeY.rows[0].phone).toBe('0912340010');
      expect(beforeY.rows[0].phone_verified_at).toBeNull();

      await request(app)
        .post('/api/verification/phone/send-code')
        .set('Authorization', `Bearer ${tokenX}`)
        .send({ phone: '0912340010' });
      const code = await readLatestOtpCode('0912340010');

      const verifyRes = await request(app)
        .post('/api/verification/phone/verify')
        .set('Authorization', `Bearer ${tokenX}`)
        .send({ phone: '0912340010', code });

      expect(verifyRes.status).toBe(200);

      const afterX = await db.query('SELECT phone, phone_verified_at FROM users WHERE id = $1', [userX.id]);
      expect(afterX.rows[0].phone).toBe('0912340010');
      expect(afterX.rows[0].phone_verified_at).toBeTruthy();

      const afterY = await db.query('SELECT phone, phone_verified_at FROM users WHERE id = $1', [userY.id]);
      expect(afterY.rows[0].phone).toBeNull();
      expect(afterY.rows[0].phone_verified_at).toBeNull();

      const { rows: auditRows } = await db.query(
        `SELECT action, entity_id, details FROM audit_logs WHERE action = 'USER_PHONE_RECLAIMED' AND entity_id = $1`,
        [userY.id]
      );
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].details.reclaimedByUserId).toBe(userX.id);

      const { rows: verifiedAuditRows } = await db.query(
        `SELECT action FROM audit_logs WHERE action = 'USER_PHONE_VERIFIED' AND entity_id = $1`,
        [userX.id]
      );
      expect(verifiedAuditRows).toHaveLength(1);
    });

    it('S đã được xác thực bởi Y → X xác thực S → 409 PHONE_TAKEN, Y không đổi', async () => {
      const userY = await createUser({ username: 'otp_verified_y', phone: '0912340011' });
      await db.query('UPDATE users SET phone_verified_at = NOW() WHERE id = $1', [userY.id]);

      const userX = await createUser({ username: 'otp_blocked_x', phone: null });
      const tokenX = await loginToken(userX);

      await request(app)
        .post('/api/verification/phone/send-code')
        .set('Authorization', `Bearer ${tokenX}`)
        .send({ phone: '0912340011' });
      const code = await readLatestOtpCode('0912340011');

      const verifyRes = await request(app)
        .post('/api/verification/phone/verify')
        .set('Authorization', `Bearer ${tokenX}`)
        .send({ phone: '0912340011', code });

      expect(verifyRes.status).toBe(409);
      expect(verifyRes.body.code).toBe('PHONE_TAKEN');

      const afterY = await db.query('SELECT phone, phone_verified_at FROM users WHERE id = $1', [userY.id]);
      expect(afterY.rows[0].phone).toBe('0912340011');
      expect(afterY.rows[0].phone_verified_at).toBeTruthy();

      const afterX = await db.query('SELECT phone FROM users WHERE id = $1', [userX.id]);
      expect(afterX.rows[0].phone).toBeNull();
    });
  });

  describe('requirePhone sau khi xác thực (PHONE_GATE_ENABLED mặc định bật)', () => {
    it('có phone nhưng chưa xác thực → 403 PHONE_NOT_VERIFIED (không phải PHONE_REQUIRED)', async () => {
      const user = await createUser({ username: 'otp_gate_unverified', phone: '0912340012' });
      const token = await loginToken(user);

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PHONE_NOT_VERIFIED');
    });

    it('xác thực xong → qua cổng requirePhone bình thường', async () => {
      const user = await createUser({ username: 'otp_gate_verified', phone: null });
      const token = await loginToken(user);

      await request(app)
        .post('/api/verification/phone/send-code')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '0912340013' });
      const code = await readLatestOtpCode('0912340013');
      await request(app)
        .post('/api/verification/phone/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '0912340013', code });

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });
});

describe('PHONE_OTP_PROVIDER rỗng — hai route mới trả 404, không endpoint nào lỗi', () => {
  let originalProviderInner;

  beforeAll(() => {
    originalProviderInner = process.env.PHONE_OTP_PROVIDER;
    delete process.env.PHONE_OTP_PROVIDER;
  });

  afterAll(() => {
    if (originalProviderInner === undefined) delete process.env.PHONE_OTP_PROVIDER;
    else process.env.PHONE_OTP_PROVIDER = originalProviderInner;
  });

  it('send-code → 404 PHONE_OTP_DISABLED', async () => {
    const user = await createUser({ username: 'otp_off_send', phone: '0912340020' });
    const token = await loginToken(user);

    const res = await request(app)
      .post('/api/verification/phone/send-code')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340021' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PHONE_OTP_DISABLED');
  });

  it('verify → 404 PHONE_OTP_DISABLED', async () => {
    const user = await createUser({ username: 'otp_off_verify', phone: '0912340022' });
    const token = await loginToken(user);

    const res = await request(app)
      .post('/api/verification/phone/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '0912340022', code: '123456' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PHONE_OTP_DISABLED');
  });

  it('requirePhone quay lại chỉ đòi có SĐT (không đòi phone_verified_at)', async () => {
    const user = await createUser({ username: 'otp_off_gate', phone: '0912340023' });
    const token = await loginToken(user);

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
