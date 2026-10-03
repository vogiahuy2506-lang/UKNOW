process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-two-factor-ctl';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-two-factor-ctl';
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'unit-test-smtp-secret-key';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

/**
 * Đăng nhập khi đã bật 2FA: login/googleLogin KHÔNG cấp token/cookie mà trả challengeToken;
 * /2fa/verify đổi challengeToken + mã lấy phiên (access token + cookie refresh). Ghim luật `purpose`.
 */

const mockClient = { query: jest.fn(), release: jest.fn() };
const mockInsertRefreshToken = jest.fn();
let tfRow = null; // dòng user_two_factor giả (null = chưa bật)

const repoFns = {
  findByUserId: jest.fn(async () => tfRow),
  findUserCredentials: jest.fn(async () => null),
  upsertPending: jest.fn(),
  enable: jest.fn(),
  replaceRecoveryCodes: jest.fn(),
  consumeRecoveryCode: jest.fn(async () => 0),
  markStepUsed: jest.fn(async () => 1),
  bumpFailed: jest.fn(async () => ({ failed_attempts: 1, locked_until: null })),
  resetFailed: jest.fn(async () => {}),
  deleteByUserId: jest.fn(),
};

jest.unstable_mockModule('../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => mockClient), query: jest.fn(async () => ({ rows: [] })) },
}));
jest.unstable_mockModule('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: jest.fn() })),
}));
jest.unstable_mockModule('../../services/verification.service.js', () => ({ default: { verifyCode: jest.fn(), markCodeAsUsed: jest.fn() } }));
jest.unstable_mockModule('../../services/email/welcomeEmailTemplate.service.js', () => ({ sendWelcomeEmail: jest.fn() }));
jest.unstable_mockModule('../../repositories/user/user.repository.js', () => ({
  findActiveUserByEmail: jest.fn(),
  updatePasswordByEmail: jest.fn(),
  activateUserByEmail: jest.fn(),
  findMembershipsByEmployeeId: jest.fn().mockResolvedValue([]),
  insertRefreshToken: mockInsertRefreshToken,
  revokeAllRefreshTokensForUser: jest.fn(),
  findActiveBillingPeriod: jest.fn().mockResolvedValue('monthly'),
}));
jest.unstable_mockModule('../../repositories/user/userConsent.repository.js', () => ({
  default: { recordConsents: jest.fn() },
  recordConsents: jest.fn(),
  getUserLatestConsents: jest.fn().mockResolvedValue(null),
  hasConsentedCurrent: jest.fn().mockReturnValue(false),
  isConsentVersionOutdated: jest.fn().mockReturnValue(false),
}));
jest.unstable_mockModule('../../repositories/user/userTwoFactor.repository.js', () => ({ ...repoFns, default: repoFns }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logSystem: jest.fn(),
  AUDIT_ACTIONS: { TWO_FACTOR_RECOVERY_USED: 'TWO_FACTOR_RECOVERY_USED' },
  AUDIT_ENTITY_TYPES: { USER: 'user' },
}));
jest.unstable_mockModule('../../services/user/signupTrialTx.service.js', () => ({ grantSignupTrialInTx: jest.fn() }));
jest.unstable_mockModule('../../utils/memberSheetSync.util.js', () => ({ pushMemberToSheet: jest.fn() }));
jest.unstable_mockModule('../../repositories/landingPageShare.repository.js', () => ({ default: { claimPendingByUserId: jest.fn() } }));
jest.unstable_mockModule('../../repositories/campaign/campaignShare.repository.js', () => ({ default: { claimPendingByUserId: jest.fn() } }));
jest.unstable_mockModule('../../repositories/ai/chatbotShare.repository.js', () => ({ default: { claimPendingByUserId: jest.fn() } }));

const authController = (await import('../auth.controller.js')).default;
const { totpAt } = await import('../../utils/totp.util.js');
const { encryptTotpSecret } = await import('../../utils/totpSecretCrypto.util.js');
const { issueChallengeToken } = await import('../../services/auth/twoFactor.service.js');

const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const PASSWORD = 'Passw0rd!';

const userRow = () => ({
  id: 42, username: 'tfuser', email: 'tf@test.local', full_name: 'TF', avatar_url: null, status: 'active',
  role: 'admin', active_plan_id: null, password_hash: bcrypt.hashSync(PASSWORD, 4),
  failed_login_attempts: 0, locked_until: null, phone: null, phone_verified_at: null,
  referral_code: 'R1', referral_prompt_dismissed_at: null,
});

function createRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  return res;
}
const req = (body) => ({ body, ip: '203.0.113.5', headers: { 'user-agent': 'jest' }, socket: {} });
const sqlCalls = () => mockClient.query.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  jest.clearAllMocks();
  tfRow = null;
  mockClient.query.mockImplementation(async (sql) => {
    if (/FROM users\s+WHERE (username|id) = \$1/.test(sql)) return { rows: [userRow()] };
    return { rows: [] };
  });
  repoFns.findByUserId.mockImplementation(async () => tfRow);
  repoFns.consumeRecoveryCode.mockImplementation(async () => 0);
  repoFns.markStepUsed.mockImplementation(async () => 1);
  repoFns.bumpFailed.mockImplementation(async () => ({ failed_attempts: 1, locked_until: null }));
});

const enable2fa = (extra = {}) => {
  tfRow = { user_id: 42, secret_enc: encryptTotpSecret(SECRET), enabled_at: new Date(), recovery_codes: [], last_used_step: null, failed_attempts: 0, locked_until: null, ...extra };
};

describe('login khi đã bật 2FA', () => {
  it('mật khẩu đúng → trả challengeToken, KHÔNG accessToken, KHÔNG cookie, KHÔNG refresh token, KHÔNG login_history', async () => {
    enable2fa();
    const res = createRes();
    await authController.login(req({ username: 'tfuser', password: PASSWORD, rememberMe: false }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ requiresTwoFactor: true, challengeToken: expect.any(String), rememberMe: false, method: 'local' });
    expect(body.data.accessToken).toBeUndefined();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(mockInsertRefreshToken).not.toHaveBeenCalled();
    expect(sqlCalls().some((s) => /login_history/.test(s))).toBe(false);
    const decoded = jwt.decode(body.data.challengeToken);
    expect(decoded).toMatchObject({ userId: 42, purpose: 'two_factor_challenge', method: 'local', rememberMe: false });
  });

  it('chưa bật 2FA → payload như cũ (accessToken + cookie refresh)', async () => {
    const res = createRes();
    await authController.login(req({ username: 'tfuser', password: PASSWORD }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toBe('Đăng nhập thành công');
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.requiresTwoFactor).toBeUndefined();
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', expect.any(String), expect.objectContaining({ httpOnly: true, path: '/api/auth' }));
  });

  it('dòng 2FA còn pending (enabled_at NULL) → vẫn đăng nhập thường', async () => {
    enable2fa({ enabled_at: null });
    const res = createRes();
    await authController.login(req({ username: 'tfuser', password: PASSWORD }), res);
    expect(res.json.mock.calls[0][0].data.accessToken).toEqual(expect.any(String));
  });

  it('mật khẩu sai → 401 như cũ, không hề hỏi tới 2FA', async () => {
    enable2fa();
    const res = createRes();
    await authController.login(req({ username: 'tfuser', password: 'sai-mat-khau' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(repoFns.findByUserId).not.toHaveBeenCalled();
  });
});

describe('POST /auth/2fa/verify (verifyTwoFactor)', () => {
  it('challenge + mã TOTP đúng → accessToken + cookie refresh theo rememberMe của challenge + login_history "2fa"', async () => {
    enable2fa();
    const challengeToken = issueChallengeToken({ id: 42 }, { method: 'local', rememberMe: false });
    const res = createRes();
    await authController.verifyTwoFactor(req({ challengeToken, code: totpAt(SECRET, { timestampMs: Date.now() }) }), res);
    const body = res.json.mock.calls[0][0];
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.user.id).toBe(42);
    expect(body.data.user.memberships).toEqual([]);
    // rememberMe=false → cookie phiên (không maxAge)
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie.mock.calls[0][2].maxAge).toBeUndefined();
    const loginHistory = mockClient.query.mock.calls.find((c) => /INSERT INTO login_history/.test(c[0]));
    expect(loginHistory[1].slice(0, 4)).toEqual([42, 'tf@test.local', 'success', '2fa']);
  });

  it('method google → login_history "google+2fa"; rememberMe true → cookie có maxAge 7 ngày', async () => {
    enable2fa();
    const challengeToken = issueChallengeToken({ id: 42 }, { method: 'google', rememberMe: true });
    const res = createRes();
    await authController.verifyTwoFactor(req({ challengeToken, code: totpAt(SECRET, { timestampMs: Date.now() }) }), res);
    expect(res.cookie.mock.calls[0][2].maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    const loginHistory = mockClient.query.mock.calls.find((c) => /INSERT INTO login_history/.test(c[0]));
    expect(loginHistory[1][3]).toBe('google+2fa');
  });

  it('challengeToken là ACCESS TOKEN thật (không có purpose) → 401, không cấp phiên', async () => {
    enable2fa();
    const accessToken = jwt.sign({ userId: 42, email: 'tf@test.local', role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '3h' });
    const res = createRes();
    await authController.verifyTwoFactor(req({ challengeToken: accessToken, code: totpAt(SECRET, { timestampMs: Date.now() }) }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'TWO_FACTOR_CODE_INVALID' });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('challengeToken hết hạn → 401', async () => {
    enable2fa();
    const expired = jwt.sign({ userId: 42, purpose: 'two_factor_challenge' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '-1s' });
    const res = createRes();
    await authController.verifyTwoFactor(req({ challengeToken: expired, code: '123456' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('mã sai → 401 TWO_FACTOR_CODE_INVALID + login_history failed "Mã 2FA sai", không cookie', async () => {
    enable2fa();
    const challengeToken = issueChallengeToken({ id: 42 }, { method: 'local', rememberMe: true });
    const res = createRes();
    await authController.verifyTwoFactor(req({ challengeToken, code: '000000' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].code).toBe('TWO_FACTOR_CODE_INVALID');
    expect(res.cookie).not.toHaveBeenCalled();
    const loginHistory = mockClient.query.mock.calls.find((c) => /INSERT INTO login_history/.test(c[0]));
    expect(loginHistory[1].slice(2, 4)).toEqual(['failed', 'Mã 2FA sai']);
  });

  it('đang bị khoá → 403 TWO_FACTOR_LOCKED kèm retryAfterSeconds, mã đúng cũng không qua', async () => {
    enable2fa({ locked_until: new Date(Date.now() + 10 * 60 * 1000) });
    const challengeToken = issueChallengeToken({ id: 42 }, { method: 'local', rememberMe: true });
    const res = createRes();
    await authController.verifyTwoFactor(req({ challengeToken, code: totpAt(SECRET, { timestampMs: Date.now() }) }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0]).toMatchObject({ code: 'TWO_FACTOR_LOCKED', retryAfterSeconds: expect.any(Number) });
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
