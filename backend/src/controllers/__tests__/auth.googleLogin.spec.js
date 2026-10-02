process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-google-login';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-google-login';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

/**
 * googleLogin: token Google chỉ được tin khi cấp cho CHÍNH client của app (GOOGLE_CLIENT_ID), tài
 * khoản đang khoá tạm không mở được bằng Google, và khoá còn hiệu lực không bị xoá.
 * refreshToken: JWT chỉ nhận HS256.
 */

const APP_CLIENT_ID = 'app-client-id.apps.googleusercontent.com';

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};
const mockVerifyIdToken = jest.fn();
const mockInsertRefreshToken = jest.fn();

jest.unstable_mockModule('../../config/database.js', () => ({
  default: {
    getClient: jest.fn(async () => mockClient),
    query: jest.fn(async () => ({ rows: [] })),
  },
}));

jest.unstable_mockModule('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}));

jest.unstable_mockModule('../../services/verification.service.js', () => ({
  default: {
    verifyCode: jest.fn(),
    markCodeAsUsed: jest.fn(),
  },
}));

jest.unstable_mockModule('../../services/email/welcomeEmailTemplate.service.js', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
}));

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

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logSystem: jest.fn(),
  AUDIT_ACTIONS: { USER_REGISTERED: 'USER_REGISTERED', USER_PLAN_CHANGED: 'USER_PLAN_CHANGED' },
  AUDIT_ENTITY_TYPES: { USER: 'USER' },
}));

jest.unstable_mockModule('../../services/user/signupTrialTx.service.js', () => ({
  grantSignupTrialInTx: jest.fn().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../utils/memberSheetSync.util.js', () => ({
  pushMemberToSheet: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../../repositories/landingPageShare.repository.js', () => ({
  default: { claimPendingByUserId: jest.fn().mockResolvedValue([]) },
}));
jest.unstable_mockModule('../../repositories/campaign/campaignShare.repository.js', () => ({
  default: { claimPendingByUserId: jest.fn().mockResolvedValue([]) },
}));
jest.unstable_mockModule('../../repositories/ai/chatbotShare.repository.js', () => ({
  default: { claimPendingByUserId: jest.fn().mockResolvedValue([]) },
}));

const authController = (await import('../auth.controller.js')).default;

function createRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  return res;
}

function googleReq(body) {
  return { body, ip: '203.0.113.9', headers: { 'user-agent': 'jest' }, socket: {} };
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const existingUser = (overrides = {}) => ({
  id: 42,
  username: 'gguser',
  email: 'gguser@test.local',
  full_name: 'GG User',
  avatar_url: null,
  status: 'active',
  role: 'user',
  active_plan_id: null,
  password_hash: 'x',
  failed_login_attempts: 0,
  locked_until: null,
  phone: null,
  phone_verified_at: null,
  referral_code: 'REF1',
  referral_prompt_dismissed_at: null,
  ...overrides,
});

/** Định tuyến client.query theo nội dung câu SQL (thứ tự không quan trọng). */
function routeClientQueries({ user }) {
  mockClient.query.mockImplementation(async (sql) => {
    if (/FROM users\s+WHERE LOWER\(email\) = LOWER\(\$1\)/.test(sql)) {
      return { rows: user ? [user] : [] };
    }
    if (/FROM user_members um/.test(sql)) return { rows: [] };
    return { rows: [] };
  });
}

function sqlCalls() {
  return mockClient.query.mock.calls.map((c) => String(c[0]));
}

describe('authController.googleLogin — access_token phải cấp cho app', () => {
  const originalFetch = global.fetch;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = APP_CLIENT_ID;
    global.fetch = jest.fn();
    routeClientQueries({ user: existingUser() });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
  });

  const userinfo = jsonResponse({
    email: 'gguser@test.local',
    email_verified: true,
    name: 'GG User',
    picture: 'https://example.com/p.png',
  });

  it('token cấp cho client Google KHÁC → 401, không gọi userinfo, không tra DB user', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({
      aud: 'other-app.apps.googleusercontent.com',
      azp: 'other-app.apps.googleusercontent.com',
      expires_in: '3500',
      email: 'gguser@test.local',
      email_verified: 'true',
    }));
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'foreign-token' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const tokenInfoUrl = String(global.fetch.mock.calls[0][0]);
    expect(tokenInfoUrl).toBe('https://oauth2.googleapis.com/tokeninfo?access_token=foreign-token');
    expect(sqlCalls().some((s) => /FROM users/.test(s))).toBe(false);
    expect(mockInsertRefreshToken).not.toHaveBeenCalled();
  });

  it('aud khớp GOOGLE_CLIENT_ID → đọc userinfo bằng Bearer và đăng nhập thành công', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ aud: APP_CLIENT_ID, azp: APP_CLIENT_ID, expires_in: '3599' }))
      .mockResolvedValueOnce(userinfo);
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'app-token' }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toBe('https://www.googleapis.com/oauth2/v3/userinfo');
    expect(global.fetch.mock.calls[1][1]).toEqual({ headers: { Authorization: 'Bearer app-token' } });
    expect(mockInsertRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('chỉ azp khớp GOOGLE_CLIENT_ID (aud khác) → vẫn chấp nhận', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ aud: 'something-else', azp: APP_CLIENT_ID, expires_in: 120 }))
      .mockResolvedValueOnce(userinfo);
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'app-token' }), res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it.each([
    ['expires_in = 0', { aud: APP_CLIENT_ID, expires_in: '0' }],
    ['expires_in âm', { aud: APP_CLIENT_ID, expires_in: '-5' }],
    ['thiếu expires_in', { aud: APP_CLIENT_ID }],
    ['thiếu aud/azp', { expires_in: '3000' }],
  ])('tokeninfo %s → 401, không gọi userinfo', async (_label, info) => {
    global.fetch.mockResolvedValueOnce(jsonResponse(info));
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'tok' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('tokeninfo trả lỗi (token hỏng/hết hạn) → 401', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ error: 'invalid_token' }, false, 400));
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'bad' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('userinfo báo email chưa xác thực → 401', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ aud: APP_CLIENT_ID, expires_in: '3000' }))
      .mockResolvedValueOnce(jsonResponse({ email: 'gguser@test.local', email_verified: false }));
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'tok' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toMatch(/chưa được xác thực/);
  });

  it('thiếu GOOGLE_CLIENT_ID → 503, không gọi Google (cả access_token lẫn credential)', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res1 = createRes();
    await authController.googleLogin(googleReq({ access_token: 'tok' }), res1);
    const res2 = createRes();
    await authController.googleLogin(googleReq({ credential: 'id-token' }), res2);

    expect(res1.status).toHaveBeenCalledWith(503);
    expect(res2.status).toHaveBeenCalledWith(503);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('credential (ID token) kiểm audience = GOOGLE_CLIENT_ID', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'gguser@test.local', email_verified: true, name: 'GG User' }),
    });
    const res = createRes();

    await authController.googleLogin(googleReq({ credential: 'id-token' }), res);

    expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: 'id-token', audience: APP_CLIENT_ID });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('authController.googleLogin — khoá tạm do sai mật khẩu', () => {
  const originalFetch = global.fetch;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = APP_CLIENT_ID;
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ aud: APP_CLIENT_ID, expires_in: '3000' }))
      .mockResolvedValueOnce(jsonResponse({ email: 'gguser@test.local', email_verified: true, name: 'GG User' }));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalClientId;
  });

  it('tài khoản đang khoá → 403, không xoá khoá, không cấp token', async () => {
    routeClientQueries({
      user: existingUser({ failed_login_attempts: 5, locked_until: new Date(Date.now() + 20 * 60 * 1000).toISOString() }),
    });
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'tok' }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].message).toMatch(/khóa tạm thời/);
    expect(sqlCalls().some((s) => /UPDATE users/.test(s))).toBe(false);
    expect(mockInsertRefreshToken).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('khoá đã hết hạn → đăng nhập được; câu cập nhật chỉ xoá khoá khi khoá không còn hiệu lực', async () => {
    routeClientQueries({
      user: existingUser({ failed_login_attempts: 5, locked_until: new Date(Date.now() - 60 * 1000).toISOString() }),
    });
    const res = createRes();

    await authController.googleLogin(googleReq({ access_token: 'tok' }), res);

    expect(res.status).not.toHaveBeenCalled();
    const resetSql = sqlCalls().find((s) => /last_login_at = CURRENT_TIMESTAMP/.test(s));
    expect(resetSql).toBeDefined();
    expect(resetSql).toMatch(/failed_login_attempts = CASE WHEN locked_until > NOW\(\) THEN failed_login_attempts ELSE 0 END/);
    expect(resetSql).toMatch(/locked_until = CASE WHEN locked_until > NOW\(\) THEN locked_until ELSE NULL END/);
    expect(resetSql).not.toMatch(/SET failed_login_attempts = 0, locked_until = NULL/);
  });
});

describe('authController.refreshToken — JWT chỉ nhận HS256', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  it('refresh token ký HS512 (đúng khoá) → 401, không tra DB', async () => {
    const token = jwt.sign({ userId: 1, tokenId: 't' }, process.env.JWT_REFRESH_SECRET, { algorithm: 'HS512' });
    const res = createRes();

    await authController.refreshToken({ cookies: { refreshToken: token }, headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('refresh token ký HS256 → qua bước verify, tra DB', async () => {
    const token = jwt.sign({ userId: 1, tokenId: 't' }, process.env.JWT_REFRESH_SECRET, { algorithm: 'HS256' });
    const res = createRes();

    await authController.refreshToken({ cookies: { refreshToken: token }, headers: {} }, res);

    expect(mockClient.query).toHaveBeenCalled();
    // Không có trong DB (mock rỗng) → 401 "không tồn tại", nhưng đã qua được verify chữ ký
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].message).toMatch(/không tồn tại|thu hồi/);
  });

  it('access/refresh token hệ thống tự ký dùng HS256', () => {
    const access = authController.generateAccessToken({ id: 1, email: 'a@test.local', role: 'user' });
    expect(jwt.decode(access, { complete: true }).header.alg).toBe('HS256');
  });
});
