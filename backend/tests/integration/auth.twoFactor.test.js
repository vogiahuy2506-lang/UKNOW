/**
 * Integration: xác thực hai lớp (TOTP) — PLAN_XAC_THUC_HAI_LOP_2FA mục 3/4/7.
 * HTTP thật qua supertest + Postgres thật. Luồng: setup → enable → login (challenge) → verify.
 */
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'integration-test-smtp-secret-key';

import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { totpAt } from '../../src/utils/totp.util.js';
import { googleTokenInfoFields, useGoogleTestClientId } from './helpers/googleAuth.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

const PASSWORD = 'Passw0rd!';
/** Mã của bước kế tiếp (luôn > bước đã dùng lúc enable, và luôn nằm trong cửa sổ ±1). */
const nextCode = (secret) => totpAt(secret, { timestampMs: Date.now() + 30000 });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function login(user) {
  return request(app).post('/api/auth/login').send({ username: user.username, password: PASSWORD });
}

/** Tạo user + bật 2FA qua API thật. @returns {{ user, token, secret, recoveryCodes }} */
async function userWithTwoFactor(overrides = {}) {
  const user = await createUser(overrides);
  const loginRes = await login(user);
  expect(loginRes.status).toBe(200);
  const token = loginRes.body.data.accessToken;
  const setup = await request(app).post('/api/auth/2fa/setup').set(bearer(token));
  expect(setup.status).toBe(200);
  const secret = setup.body.data.secret;
  const enable = await request(app)
    .post('/api/auth/2fa/enable')
    .set(bearer(token))
    .send({ code: totpAt(secret, { timestampMs: Date.now() }) });
  expect(enable.status).toBe(200);
  return { user, token, secret, recoveryCodes: enable.body.data.recoveryCodes };
}

async function challengeFor(user) {
  const res = await login(user);
  expect(res.status).toBe(200);
  expect(res.body.data.requiresTwoFactor).toBe(true);
  return res.body.data.challengeToken;
}

const verify = (challengeToken, code) => request(app).post('/api/auth/2fa/verify').send({ challengeToken, code });

describe('setup + enable + status', () => {
  it('setup → pending (secret mã hoá trong DB, enabled_at NULL); enable → 8 mã khôi phục dạng XXXXX-XXXXX', async () => {
    const user = await createUser();
    const token = (await login(user)).body.data.accessToken;

    expect((await request(app).get('/api/auth/2fa/status').set(bearer(token))).body.data).toEqual({
      enabled: false, enabledAt: null, recoveryCodesLeft: 0, requiresPasswordToDisable: true,
    });

    const setup = await request(app).post('/api/auth/2fa/setup').set(bearer(token));
    expect(setup.status).toBe(200);
    expect(setup.body.data.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.data.otpauthUrl).toContain(`otpauth://totp/Founder%20AI:${user.username}?secret=${setup.body.data.secret}`);
    expect(setup.body.data.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    const pending = (await db.query('SELECT secret_enc, enabled_at FROM user_two_factor WHERE user_id = $1', [user.id])).rows[0];
    expect(pending.enabled_at).toBeNull();
    expect(pending.secret_enc.startsWith('enc:v1:')).toBe(true);
    expect(pending.secret_enc).not.toContain(setup.body.data.secret);

    // pending chưa có hiệu lực khi đăng nhập
    expect((await login(user)).body.data.accessToken).toEqual(expect.any(String));

    // enable sai mã → 401, đúng mã → 8 mã khôi phục
    const bad = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: '000000' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('TWO_FACTOR_CODE_INVALID');
    const ok = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: totpAt(setup.body.data.secret, { timestampMs: Date.now() }) });
    expect(ok.status).toBe(200);
    expect(ok.body.data.recoveryCodes).toHaveLength(8);
    for (const c of ok.body.data.recoveryCodes) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const row = (await db.query('SELECT enabled_at, jsonb_array_length(recovery_codes) AS n, last_used_step FROM user_two_factor WHERE user_id = $1', [user.id])).rows[0];
    expect(row.enabled_at).not.toBeNull();
    expect(row.n).toBe(8);
    expect(row.last_used_step).not.toBeNull();
    // mã khôi phục lưu hash, không lưu thô
    const stored = (await db.query('SELECT recovery_codes FROM user_two_factor WHERE user_id = $1', [user.id])).rows[0].recovery_codes;
    for (const c of ok.body.data.recoveryCodes) expect(JSON.stringify(stored)).not.toContain(c.replace('-', ''));

    // đã bật: setup lại → 409, enable lại → 400
    expect((await request(app).post('/api/auth/2fa/setup').set(bearer(token))).status).toBe(409);
    const again = await request(app).post('/api/auth/2fa/enable').set(bearer(token)).send({ code: '123456' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('TWO_FACTOR_NOT_PENDING');
    expect((await request(app).get('/api/auth/2fa/status').set(bearer(token))).body.data).toMatchObject({ enabled: true, recoveryCodesLeft: 8 });
  });

  it('các route 2FA cần đăng nhập', async () => {
    expect((await request(app).get('/api/auth/2fa/status')).status).toBe(401);
    expect((await request(app).post('/api/auth/2fa/setup')).status).toBe(401);
  });
});

describe('đăng nhập hai bước', () => {
  it('login → requiresTwoFactor, KHÔNG accessToken, KHÔNG Set-Cookie; verify đúng mã → 200 + cookie refresh + login_history "2fa"', async () => {
    const { user, secret } = await userWithTwoFactor();

    const res = await login(user);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ requiresTwoFactor: true, rememberMe: true, method: 'local' });
    expect(res.body.data.challengeToken).toEqual(expect.any(String));
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
    const successBefore = (await db.query("SELECT COUNT(*)::int AS n FROM login_history WHERE id_user = $1 AND login_status = 'success' AND failure_reason = '2fa'", [user.id])).rows[0].n;
    expect(successBefore).toBe(0);

    const ok = await verify(res.body.data.challengeToken, nextCode(secret));
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
    expect(ok.body.data.user.id).toBe(user.id);
    expect(ok.body.data.user.memberships).toEqual([]);
    const cookie = ok.headers['set-cookie'].join(';');
    expect(cookie).toContain('refreshToken=');
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');

    const hist = (await db.query("SELECT login_status, failure_reason FROM login_history WHERE id_user = $1 ORDER BY id DESC LIMIT 1", [user.id])).rows[0];
    expect(hist).toEqual({ login_status: 'success', failure_reason: '2fa' });

    // access token từ verify dùng được
    const me = await request(app).get('/api/auth/me').set(bearer(ok.body.data.accessToken));
    expect(me.status).toBe(200);
  });

  it('dùng lại CÙNG mã → 401 + login_history failed "Mã 2FA sai"', async () => {
    const { user, secret } = await userWithTwoFactor();
    const code = nextCode(secret);
    expect((await verify(await challengeFor(user), code)).status).toBe(200);
    const replay = await verify(await challengeFor(user), code);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('TWO_FACTOR_CODE_INVALID');
    const hist = (await db.query("SELECT login_status, failure_reason FROM login_history WHERE id_user = $1 ORDER BY id DESC LIMIT 1", [user.id])).rows[0];
    expect(hist).toEqual({ login_status: 'failed', failure_reason: 'Mã 2FA sai' });
  });

  it('mã khôi phục: lần 1 → 200 (còn 7, audit TWO_FACTOR_RECOVERY_USED), lần 2 cùng mã → 401', async () => {
    const { user, recoveryCodes } = await userWithTwoFactor();
    expect((await verify(await challengeFor(user), recoveryCodes[0])).status).toBe(200);
    expect((await db.query('SELECT jsonb_array_length(recovery_codes) AS n FROM user_two_factor WHERE user_id = $1', [user.id])).rows[0].n).toBe(7);
    expect((await verify(await challengeFor(user), recoveryCodes[0])).status).toBe(401);
    const audit = await db.query("SELECT 1 FROM audit_logs WHERE id_user = $1 AND action = 'TWO_FACTOR_RECOVERY_USED'", [user.id]);
    expect(audit.rows).toHaveLength(1);
  });

  it('5 lần sai → lần 5 = 403 TWO_FACTOR_LOCKED (locked_until ≈ +15 phút); mã đúng ngay sau đó vẫn 403', async () => {
    const { user, secret } = await userWithTwoFactor();
    const challenge = await challengeFor(user);
    for (let i = 0; i < 4; i += 1) {
      const r = await verify(challenge, '000000');
      expect(r.status).toBe(401);
    }
    const fifth = await verify(challenge, '000000');
    expect(fifth.status).toBe(403);
    expect(fifth.body.code).toBe('TWO_FACTOR_LOCKED');
    expect(fifth.body.retryAfterSeconds).toBeGreaterThan(14 * 60);

    const row = (await db.query("SELECT failed_attempts, EXTRACT(EPOCH FROM (locked_until - NOW())) AS secs FROM user_two_factor WHERE user_id = $1", [user.id])).rows[0];
    expect(row.failed_attempts).toBe(5);
    expect(Number(row.secs)).toBeGreaterThan(14 * 60);
    expect(Number(row.secs)).toBeLessThanOrEqual(15 * 60);

    const good = await verify(challenge, nextCode(secret));
    expect(good.status).toBe(403);
    expect(good.headers['set-cookie']).toBeUndefined();
  });

  it('challengeToken là ACCESS TOKEN thật → 401; challenge dùng làm Bearer → 401 trên /auth/me; challenge hết hạn → 401', async () => {
    const { user, token, secret } = await userWithTwoFactor();
    const code = nextCode(secret);
    expect((await verify(token, code)).status).toBe(401);

    const challenge = await challengeFor(user);
    expect((await request(app).get('/api/auth/me').set(bearer(challenge))).status).toBe(401);

    const expired = jwt.sign({ userId: user.id, purpose: 'two_factor_challenge', method: 'local', rememberMe: true }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '-5s' });
    expect((await verify(expired, code)).status).toBe(401);
  });

  it('rememberMe=false được mang qua challenge: cookie phiên (không Max-Age)', async () => {
    const { user, secret } = await userWithTwoFactor();
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password: PASSWORD, rememberMe: false });
    expect(res.body.data.rememberMe).toBe(false);
    const ok = await verify(res.body.data.challengeToken, nextCode(secret));
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'].join(';')).not.toMatch(/Max-Age|Expires=/i);
  });

  it('Google login với tài khoản đã bật 2FA → requiresTwoFactor (method google), verify xong login_history "google+2fa"', async () => {
    const restoreGoogleClientId = useGoogleTestClientId();
    const email = 'google2fa@test.local';
    const { user, secret } = await userWithTwoFactor({ email });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ ...googleTokenInfoFields(), email, email_verified: true, name: 'G 2FA' }),
    });
    try {
      const res = await request(app).post('/api/auth/google-login').send({ access_token: 'fake' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ requiresTwoFactor: true, method: 'google' });
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();

      const ok = await verify(res.body.data.challengeToken, nextCode(secret));
      expect(ok.status).toBe(200);
      const hist = (await db.query('SELECT failure_reason FROM login_history WHERE id_user = $1 ORDER BY id DESC LIMIT 1', [user.id])).rows[0];
      expect(hist.failure_reason).toBe('google+2fa');
    } finally {
      fetchSpy.mockRestore();
      restoreGoogleClientId();
    }
  });
});

describe('tắt 2FA + mã khôi phục mới', () => {
  afterEach(() => jest.restoreAllMocks());

  it('tài khoản local: không gửi mật khẩu → 401 (dòng còn); đủ mật khẩu + mã → 200 và dòng bị xoá; audit có ENABLED + DISABLED', async () => {
    const { user, token, secret } = await userWithTwoFactor();
    const noPwd = await request(app).post('/api/auth/2fa/disable').set(bearer(token)).send({ code: nextCode(secret) });
    expect(noPwd.status).toBe(401);
    expect((await db.query('SELECT 1 FROM user_two_factor WHERE user_id = $1', [user.id])).rows).toHaveLength(1);

    const ok = await request(app).post('/api/auth/2fa/disable').set(bearer(token)).send({ code: nextCode(secret), password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ enabled: false });
    expect((await db.query('SELECT 1 FROM user_two_factor WHERE user_id = $1', [user.id])).rows).toHaveLength(0);

    const actions = (await db.query("SELECT action FROM audit_logs WHERE id_user = $1 AND action LIKE 'TWO_FACTOR_%' ORDER BY id", [user.id])).rows.map((r) => r.action);
    expect(actions).toEqual(['TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED']);

    // tắt rồi đăng nhập không hỏi mã
    expect((await login(user)).body.data.accessToken).toEqual(expect.any(String));
  });

  it('recovery-codes: cần TOTP hiện tại; bộ mới thay bộ cũ', async () => {
    const { user, token, secret, recoveryCodes } = await userWithTwoFactor();
    expect((await request(app).post('/api/auth/2fa/recovery-codes').set(bearer(token)).send({ code: recoveryCodes[0] })).status).toBe(401);
    const res = await request(app).post('/api/auth/2fa/recovery-codes').set(bearer(token)).send({ code: nextCode(secret) });
    expect(res.status).toBe(200);
    expect(res.body.data.recoveryCodes).toHaveLength(8);
    expect(res.body.data.recoveryCodes).not.toEqual(recoveryCodes);
    expect((await verify(await challengeFor(user), recoveryCodes[1])).status).toBe(401);
    expect((await verify(await challengeFor(user), res.body.data.recoveryCodes[0])).status).toBe(200);
  });
});

describe('PATCH /api/admin/members/:id/two-factor/reset', () => {
  it('admin reset → dòng biến mất, đăng nhập không hỏi mã, audit có details.email; list members có twoFactorEnabled', async () => {
    const admin = await createUser({ role: 'admin' });
    const adminToken = (await login(admin)).body.data.accessToken;
    const { user: target } = await userWithTwoFactor();

    const list = await request(app).get('/api/admin/members?segment=all').set(bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.data.find((m) => m.id === target.id).twoFactorEnabled).toBe(true);
    expect(list.body.data.find((m) => m.id === admin.id)?.twoFactorEnabled ?? false).toBe(false);

    const wrongEmail = await request(app).patch(`/api/admin/members/${target.id}/two-factor/reset`).set(bearer(adminToken)).send({ confirmEmail: 'khac@test.local' });
    expect(wrongEmail.status).toBe(400);
    expect((await request(app).patch('/api/admin/members/999999/two-factor/reset').set(bearer(adminToken)).send({ confirmEmail: 'x@test.local' })).status).toBe(404);

    const res = await request(app).patch(`/api/admin/members/${target.id}/two-factor/reset`).set(bearer(adminToken)).send({ confirmEmail: target.email });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: target.id, email: target.email, hadTwoFactor: true });
    expect((await db.query('SELECT 1 FROM user_two_factor WHERE user_id = $1', [target.id])).rows).toHaveLength(0);

    const after = await login(target);
    expect(after.body.data.requiresTwoFactor).toBeUndefined();
    expect(after.body.data.accessToken).toEqual(expect.any(String));

    const audit = (await db.query("SELECT id_user, details FROM audit_logs WHERE action = 'TWO_FACTOR_RESET_BY_ADMIN' AND entity_id = $1", [target.id])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].id_user).toBe(admin.id);
    expect(audit[0].details.email).toBe(target.email);
  });

  it('người không phải admin → 403', async () => {
    const user = await createUser();
    const token = (await login(user)).body.data.accessToken;
    const res = await request(app).patch(`/api/admin/members/${user.id}/two-factor/reset`).set(bearer(token)).send({ confirmEmail: user.email });
    expect(res.status).toBe(403);
  });
});
