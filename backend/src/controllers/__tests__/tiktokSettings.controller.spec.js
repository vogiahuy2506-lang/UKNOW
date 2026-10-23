/**
 * tiktokSettings.controller.spec.js
 *
 * Unit test cho controller — gọi method trực tiếp với mock req/res. Không dùng supertest.
 * Pattern copy từ `backend/src/controllers/__tests__/chatbot.controller.webchat.spec.js`
 * (ESM + jest.unstable_mockModule).
 *
 * Coverage:
 * - 3 bẫy ở callback: Bẫy 11 (state sai), Bẫy 14 (region), Bẫy 16 (personal account)
 * - Sanitize: response KHÔNG chứa access_token / refresh_token
 * - Auth check: 401 khi thiếu req.user.id
 * - Ownership check: 404 khi account không thuộc user
 * - happy path: callback thành công → upsert + redirect về FE
 */

import {
  describe, expect, test, beforeEach, jest,
} from '@jest/globals';

// ── Mock dependencies TRƯỚC khi import controller ────────────────
const mockListByUser = jest.fn();
const mockFindById = jest.fn();
const mockUpsert = jest.fn();
const mockUpdateTokens = jest.fn();
const mockDeactivate = jest.fn();

jest.unstable_mockModule('../../repositories/ai/tiktokBusinessAccount.repository.js', () => ({
  default: {
    listByUser: mockListByUser,
    findById: mockFindById,
    upsert: mockUpsert,
    updateTokens: mockUpdateTokens,
    deactivate: mockDeactivate,
  },
}));

const mockFindActiveByExternal = jest.fn();
const mockUpsertTiktokChannel = jest.fn();
const mockDeactivateByExternal = jest.fn();
const mockListIdsByExternal = jest.fn();
const mockCancelByPrefix = jest.fn();
jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({
  default: {
    findActiveByExternalChannelId: mockFindActiveByExternal,
    upsertTiktokBusinessChannel: mockUpsertTiktokChannel,
    deactivateByExternalChannelId: mockDeactivateByExternal,
    listIdsByExternalChannelId: mockListIdsByExternal,
  },
}));
jest.unstable_mockModule('../../services/chatbot/inboundReplyDebounce.service.js', () => ({
  default: { cancelByPrefix: mockCancelByPrefix },
}));

const mockFindFirstActiveByUser = jest.fn();
const mockFindChatbotById = jest.fn();
jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findFirstActiveByUser: mockFindFirstActiveByUser,
    findChatbotById: mockFindChatbotById,
  },
}));

const mockExchange = jest.fn();
const mockGetUserInfo = jest.fn();
const mockRefresh = jest.fn();
const mockRevoke = jest.fn();
const mockSignState = jest.fn();
const mockVerifyState = jest.fn();
const mockGetAuthorizeUrl = jest.fn();
const mockIsRegionSupported = jest.fn();

jest.unstable_mockModule('../../services/tiktok/tiktokOAuth.service.js', () => ({
  default: {
    exchangeCodeForToken: mockExchange,
    getUserInfo: mockGetUserInfo,
    refreshAccessToken: mockRefresh,
    revokeToken: mockRevoke,
    signState: mockSignState,
    verifyState: mockVerifyState,
    getAuthorizeUrl: mockGetAuthorizeUrl,
    isRegionSupported: mockIsRegionSupported,
  },
  signState: mockSignState,
  verifyState: mockVerifyState,
  exchangeCodeForToken: mockExchange,
  getUserInfo: mockGetUserInfo,
  refreshAccessToken: mockRefresh,
  revokeToken: mockRevoke,
  getAuthorizeUrl: mockGetAuthorizeUrl,
  isRegionSupported: mockIsRegionSupported,
  DEFAULT_SCOPES: 'user.info.basic,dm.message.send,dm.message.read,dm.conversation.list,dm.webhook.subscribe',
}));

// Test env cho crypto
process.env.OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || 'test-state-secret';
process.env.SMTP_SECRET_KEY = process.env.SMTP_SECRET_KEY || 'test-smtp-secret';
process.env.FRONTEND_URL = 'https://test.example';
process.env.BACKEND_PUBLIC_URL = 'https://api.test.example';
process.env.TIKTOK_OAUTH_REDIRECT_URI = 'https://api.test.example/api/webhooks/oauth/callback/tiktok';

// Test env cho crypto — dùng encryptSmtpSecret thật để tạo ciphertext hợp lệ.
const { encryptSmtpSecret } = await import('../../utils/smtpSecretCrypto.js');

const controller = (await import('../tiktokSettings.controller.js')).default;

// ── Helpers ────────────────────────────────────────────────────
function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockReq({ user = { id: 7 }, params = {}, body = {}, query = {} } = {}) {
  return { user, params, body, query };
}

describe('tiktokSettings.controller — sanitize (Bẫy 1)', () => {
  test('Loại bỏ access_token + refresh_token ra khỏi response', async () => {
    const rawAccount = {
      id: 1,
      business_id: 'biz_abc',
      display_name: 'My Shop',
      access_token: 'enc:v1:abc',
      refresh_token: 'enc:v1:def',
      region: 'APAC',
      role: 'business_account',
    };
    mockListByUser.mockResolvedValueOnce([rawAccount]);
    const res = mockRes();
    await controller.listAccounts(mockReq(), res);
    const sent = res.json.mock.calls[0][0];
    expect(sent.success).toBe(true);
    const acc = sent.data[0];
    expect(acc.id).toBe(1);
    expect(acc.business_id).toBe('biz_abc');
    expect(acc.access_token).toBeUndefined();
    expect(acc.refresh_token).toBeUndefined();
    expect(acc.has_access_token).toBe(true);
    expect(acc.has_refresh_token).toBe(true);
  });
});

describe('tiktokSettings.controller — connect', () => {
  beforeEach(() => {
    mockSignState.mockReturnValue({ state: 'signed-state-123', nonce: 'n', createdAt: Date.now() });
    mockGetAuthorizeUrl.mockReturnValue('https://tiktok.com/v2/auth/authorize/?...');
  });

  test('Sinh state + trả về auth_url (FE tự navigate — Bearer token qua axios)', async () => {
    const res = mockRes();
    await controller.connect(mockReq({ user: { id: 42 } }), res);
    expect(mockSignState).toHaveBeenCalledWith(42);
    expect(mockGetAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'signed-state-123' })
    );
    // Controller mới KHÔNG `res.redirect()` nữa — browser navigation qua
    // `window.location.href` không gửi `Authorization: Bearer ...` (token
    // trong localStorage), authMiddleware 401. Trả JSON `{ auth_url }` để
    // FE axios gắn header rồi tự navigate.
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          auth_url: 'https://tiktok.com/v2/auth/authorize/?...',
          state: 'signed-state-123',
        }),
      })
    );
  });

  test('Thiếu req.user.id → 401', async () => {
    const res = mockRes();
    await controller.connect(mockReq({ user: null }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('signState throw → 500 với message', async () => {
    mockSignState.mockImplementationOnce(() => {
      throw new Error('Chưa cấu hình OAUTH_STATE_SECRET');
    });
    const res = mockRes();
    await controller.connect(mockReq({ user: { id: 42 } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.stringContaining('OAUTH_STATE_SECRET') })
    );
  });
});

describe('tiktokSettings.controller — callback (3 bẫy)', () => {
  beforeEach(() => {
    mockExchange.mockResolvedValue({
      accessToken: 'plain-access',
      refreshToken: 'plain-refresh',
      openId: 'biz_xyz',
      scope: 'user.info.basic,dm.message.send',
      expiresIn: 86400,
      refreshExpiresIn: 31536000,
    });
    mockVerifyState.mockReturnValue({ userId: 7, nonce: 'n', createdAt: Date.now() });
    mockUpsert.mockResolvedValue({ id: 1, business_id: 'biz_xyz', display_name: 'VN Shop' });
    mockIsRegionSupported.mockReturnValue(true);
    mockFindActiveByExternal.mockReset().mockResolvedValue(null);
    mockFindChatbotById.mockReset();
    mockFindFirstActiveByUser.mockReset().mockResolvedValue({ id: 55 });
    mockUpsertTiktokChannel.mockReset().mockResolvedValue({ id: 900, id_chatbot: 55 });
  });

  test('User deny ở TikTok → redirect về FE với error=tiktok_denied', async () => {
    const res = mockRes();
    await controller.callback(
      mockReq({ query: { error: 'access_denied', error_description: 'user_cancelled' } }),
      res
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=tiktok_denied')
    );
    expect(mockExchange).not.toHaveBeenCalled();
  });

  test('Thiếu code hoặc state → redirect error=missing_code_or_state', async () => {
    const res = mockRes();
    await controller.callback(mockReq({ query: {} }), res);
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=missing_code_or_state')
    );
  });

  test('Bẫy 11: state sai chữ ký → redirect error=invalid_state', async () => {
    mockVerifyState.mockImplementationOnce(() => {
      throw new Error('OAuth state chữ ký không khớp');
    });
    const res = mockRes();
    await controller.callback(
      mockReq({ query: { code: 'code', state: 'bad-state' } }),
      res
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=invalid_state')
    );
    expect(mockExchange).not.toHaveBeenCalled();
  });

  test('Bẫy 16: role === "personal_account" → redirect error=personal_account', async () => {
    mockGetUserInfo.mockResolvedValueOnce({
      openId: 'personal_user_123',
      displayName: 'Creator',
      region: 'APAC',
      role: 'personal_account',
    });
    const res = mockRes();
    await controller.callback(
      mockReq({ query: { code: 'code', state: 'good' } }),
      res
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=personal_account')
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test('Bẫy 14: region === "EEA" → redirect error=region_unsupported', async () => {
    mockGetUserInfo.mockResolvedValueOnce({
      openId: 'biz_eu',
      displayName: 'EU Shop',
      region: 'EEA',
      role: 'business_account',
    });
    mockIsRegionSupported.mockReturnValueOnce(false);
    const res = mockRes();
    await controller.callback(
      mockReq({ query: { code: 'code', state: 'good' } }),
      res
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('error=region_unsupported')
    );
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test('Happy path: business + APAC → upsert + redirect về FE với success', async () => {
    mockGetUserInfo.mockResolvedValueOnce({
      openId: 'biz_apac',
      displayName: 'VN Shop',
      region: 'APAC',
      role: 'business_account',
    });
    const res = mockRes();
    await controller.callback(
      mockReq({ query: { code: 'code', state: 'good' } }),
      res
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        businessId: 'biz_apac',
        displayName: 'VN Shop',
        region: 'APAC',
        role: 'business_account',
        // Token đã mã hoá (KHÔNG plaintext)
        accessToken: expect.stringMatching(/^enc:v1:/),
        refreshToken: expect.stringMatching(/^enc:v1:/),
      })
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/success=connected/)
    );
    // Bẫy 15: hint check_dm_privacy luôn được gắn
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/hint=check_dm_privacy/)
    );
  });

  const businessInfo = {
    openId: 'biz_xyz', displayName: 'VN Shop', region: 'APAC', role: 'business_account',
  };

  test('Liên kết xong → tự gắn vào chatbot đang bật của chủ để bot trả lời tin nhắn', async () => {
    mockGetUserInfo.mockResolvedValueOnce(businessInfo);
    const res = mockRes();
    await controller.callback(mockReq({ query: { code: 'code', state: 'good' } }), res);
    expect(mockFindFirstActiveByUser).toHaveBeenCalledWith(7);
    expect(mockUpsertTiktokChannel).toHaveBeenCalledWith(55, {
      externalChannelId: 'biz_xyz',
      displayName: 'VN Shop',
    });
    expect(res.redirect).not.toHaveBeenCalledWith(expect.stringContaining('auto_reply=no_chatbot'));
  });

  test('Chưa có chatbot đang bật → vẫn liên kết thành công, kèm auto_reply=no_chatbot', async () => {
    mockGetUserInfo.mockResolvedValueOnce(businessInfo);
    mockFindFirstActiveByUser.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.callback(mockReq({ query: { code: 'code', state: 'good' } }), res);
    expect(mockUpsertTiktokChannel).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('success=connected'));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('auto_reply=no_chatbot'));
  });

  test('Đã gắn vào chatbot đang bật của chính chủ → giữ nguyên, không gắn lại', async () => {
    mockGetUserInfo.mockResolvedValueOnce(businessInfo);
    mockFindActiveByExternal.mockResolvedValueOnce({ id: 3, id_chatbot: 66 });
    mockFindChatbotById.mockResolvedValueOnce({ id: 66, is_active: true });
    const res = mockRes();
    await controller.callback(mockReq({ query: { code: 'code', state: 'good' } }), res);
    expect(mockFindChatbotById).toHaveBeenCalledWith(66, 7);
    expect(mockUpsertTiktokChannel).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('success=connected'));
  });

  test('Gắn chatbot lỗi (DB) → không làm hỏng việc liên kết', async () => {
    mockGetUserInfo.mockResolvedValueOnce(businessInfo);
    mockUpsertTiktokChannel.mockRejectedValueOnce(new Error('db down'));
    const res = mockRes();
    await controller.callback(mockReq({ query: { code: 'code', state: 'good' } }), res);
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('success=connected'));
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining('auto_reply=no_chatbot'));
  });
});

describe('tiktokSettings.controller — listAccounts', () => {
  test('401 khi thiếu user', async () => {
    const res = mockRes();
    await controller.listAccounts(mockReq({ user: null }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('Gọi repo với userId từ req.user', async () => {
    mockListByUser.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.listAccounts(mockReq({ user: { id: 99 } }), res);
    expect(mockListByUser).toHaveBeenCalledWith(99);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});

describe('tiktokSettings.controller — refreshAccount', () => {
  beforeEach(() => {
    mockFindById.mockResolvedValue({
      id: 1,
      access_token: encryptSmtpSecret('old-plain-access'),
      refresh_token: encryptSmtpSecret('old-plain-refresh'),
    });
    mockRefresh.mockResolvedValue({
      accessToken: 'new-plain-access',
      refreshToken: 'new-plain-refresh',
      expiresIn: 86400,
      refreshExpiresIn: 31536000,
    });
  });

  test('Happy path: decrypt → refresh → encrypt → update', async () => {
    const res = mockRes();
    await controller.refreshAccount(mockReq({ params: { id: '1' } }), res);
    expect(mockRefresh).toHaveBeenCalledWith(expect.any(String));
    expect(mockUpdateTokens).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        accessToken: expect.stringMatching(/^enc:v1:/),
        refreshToken: expect.stringMatching(/^enc:v1:/),
      })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('ID không phải số → 400', async () => {
    const res = mockRes();
    await controller.refreshAccount(mockReq({ params: { id: 'abc' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('Account không thuộc user → 404', async () => {
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.refreshAccount(mockReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('OAuth refresh fail → 502 (Bad Gateway)', async () => {
    mockRefresh.mockRejectedValueOnce(new Error('refresh_token expired'));
    const res = mockRes();
    await controller.refreshAccount(mockReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe('tiktokSettings.controller — deleteAccount', () => {
  beforeEach(() => {
    mockFindById.mockResolvedValue({
      id: 1,
      access_token: encryptSmtpSecret('plain-access-for-revoke'),
    });
    mockDeactivate.mockResolvedValue(true);
    mockDeactivateByExternal.mockReset().mockResolvedValue(1);
    mockListIdsByExternal.mockReset().mockResolvedValue([]);
    mockCancelByPrefix.mockReset();
  });

  test('Happy path: revoke (best-effort) → deactivate', async () => {
    const res = mockRes();
    await controller.deleteAccount(mockReq({ params: { id: '1' } }), res);
    expect(mockRevoke).toHaveBeenCalled();
    expect(mockDeactivate).toHaveBeenCalledWith(1, 7);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('Ngắt kết nối → tắt luôn kết nối chatbot của tài khoản', async () => {
    mockFindById.mockResolvedValueOnce({
      id: 1,
      business_id: 'biz_gone',
      access_token: encryptSmtpSecret('plain-access-for-revoke'),
    });
    mockListIdsByExternal.mockResolvedValueOnce([21, 22]);
    const res = mockRes();
    await controller.deleteAccount(mockReq({ params: { id: '1' } }), res);
    expect(mockDeactivateByExternal).toHaveBeenCalledWith('tiktok_business', 'biz_gone');
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  // Lượt tin đã enqueue có thể còn trong hàng gom khi user bấm "Ngắt" — nếu không huỷ,
  // bot vẫn trả lời tin của tài khoản đã ngắt trong vài giây tới.
  test('Ngắt kết nối → huỷ lượt trả lời đang chờ gom của các kênh của tài khoản', async () => {
    mockFindById.mockResolvedValueOnce({
      id: 1,
      business_id: 'biz_gone',
      access_token: encryptSmtpSecret('plain-access-for-revoke'),
    });
    mockListIdsByExternal.mockResolvedValueOnce([21, 22]);
    const res = mockRes();
    await controller.deleteAccount(mockReq({ params: { id: '1' } }), res);
    expect(mockCancelByPrefix).toHaveBeenCalledWith('tiktok_business:21:');
    expect(mockCancelByPrefix).toHaveBeenCalledWith('tiktok_business:22:');
  });

  test('Huỷ lượt chờ lỗi (best-effort) → vẫn ngắt kết nối thành công', async () => {
    mockFindById.mockResolvedValueOnce({
      id: 1,
      business_id: 'biz_gone',
      access_token: encryptSmtpSecret('plain-access-for-revoke'),
    });
    mockListIdsByExternal.mockRejectedValueOnce(new Error('db down'));
    const res = mockRes();
    await controller.deleteAccount(mockReq({ params: { id: '1' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('Revoke fail (best-effort) → vẫn deactivate thành công', async () => {
    mockRevoke.mockRejectedValueOnce(new Error('revoke failed'));
    const res = mockRes();
    await controller.deleteAccount(mockReq({ params: { id: '1' } }), res);
    expect(mockDeactivate).toHaveBeenCalledWith(1, 7);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  test('Account không thuộc user → 404', async () => {
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.deleteAccount(mockReq({ params: { id: '1' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('tiktokSettings.controller — testSend (PR-2 stub)', () => {
  test('Trả 501 vì adapter chưa impl (PR-3)', async () => {
    const res = mockRes();
    await controller.testSend(
      mockReq({ params: { id: '1' }, body: { conversationId: 'c1', message: 'hi' } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(501);
  });

  test('Thiếu conversationId hoặc message → 400', async () => {
    const res = mockRes();
    await controller.testSend(
      mockReq({ params: { id: '1' }, body: { message: 'hi' } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── Cross-user isolation ──────────────────────────────────────────────
// Đảm bảo user 87 KHÔNG thể thao tác trên account của user 7. Mỗi method
// dùng `:id` phải gọi `findById(id, userId)` với userId từ req.user.
describe('tiktokSettings.controller — cross-user isolation', () => {
  test('listAccounts: gọi repo với userId của user request, KHÔNG trộn', async () => {
    mockListByUser.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.listAccounts(mockReq({ user: { id: 87 } }), res);
    expect(mockListByUser).toHaveBeenCalledWith(87);
    expect(mockListByUser).not.toHaveBeenCalledWith(7);
  });

  test('refreshAccount: findById được gọi với userId của user request (87), KHÔNG user 7', async () => {
    // User 87 cố refresh account id=1 (thuộc user 7) → repo trả null → 404
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.refreshAccount(
      mockReq({ user: { id: 87 }, params: { id: '1' } }),
      res
    );
    expect(mockFindById).toHaveBeenCalledWith(1, 87);
    expect(res.status).toHaveBeenCalledWith(404);
    // Không refresh token, không update
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockUpdateTokens).not.toHaveBeenCalled();
  });

  test('deleteAccount: findById được gọi với userId của user request (87), KHÔNG user 7', async () => {
    // User 87 cố xoá account id=1 (thuộc user 7) → repo trả null → 404
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.deleteAccount(
      mockReq({ user: { id: 87 }, params: { id: '1' } }),
      res
    );
    expect(mockFindById).toHaveBeenCalledWith(1, 87);
    expect(res.status).toHaveBeenCalledWith(404);
    // Không revoke, không deactivate
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockDeactivate).not.toHaveBeenCalled();
  });

  test('testSend: findById được gọi với userId của user request (87), KHÔNG user 7', async () => {
    // User 87 cố test-send account id=1 (thuộc user 7) → repo trả null → 404
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.testSend(
      mockReq({
        user: { id: 87 },
        params: { id: '1' },
        body: { conversationId: 'c1', message: 'hi' },
      }),
      res
    );
    expect(mockFindById).toHaveBeenCalledWith(1, 87);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('refreshAccount: id dạng chuỗi vẫn parse đúng + check ownership trước khi touch TikTok', async () => {
    // Sanity: đảm bảo cả 2 path (parse + ownership) đều chạy
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.refreshAccount(
      mockReq({ user: { id: 87 }, params: { id: '999' } }),
      res
    );
    expect(mockFindById).toHaveBeenCalledWith(999, 87);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('listAccounts: response chỉ chứa account của user request, KHÔNG leak của user khác', async () => {
    // Sanity: nếu repo trả về lẫn lộn, controller KHÔNG có cách lọc — vì vậy
    // test này verify contract: repo PHẢI trả đúng của user. Khi repo mock
    // trả 1 row thuộc user 87, response phải chỉ chứa row đó.
    const user87Account = {
      id: 5,
      id_user: 87,
      business_id: 'biz_user87',
      display_name: 'User 87 Shop',
      access_token: 'enc:v1:abc',
      refresh_token: 'enc:v1:def',
      region: 'APAC',
    };
    mockListByUser.mockResolvedValueOnce([user87Account]);
    const res = mockRes();
    await controller.listAccounts(mockReq({ user: { id: 87 } }), res);
    expect(mockListByUser).toHaveBeenCalledWith(87);
    const sent = res.json.mock.calls[0][0];
    expect(sent.data).toHaveLength(1);
    expect(sent.data[0].id).toBe(5);
    expect(sent.data[0].id_user).toBe(87);
  });
});

// ── Nhân viên thao tác theo CHỦ workspace (gom mục nhẹ 20/10/2026, 4c) ───────────────────────────────
// Trước đây cả 5 method dùng `req.user.id` nên nhân viên (có quyền chatbot_channels_manage) không thấy / không thao tác được tài khoản
// TikTok của chủ. Nay dùng chủ workspace như các controller kênh khác (WhatsApp, Facebook).
describe('tiktokSettings.controller — nhân viên dùng tài khoản TikTok của chủ', () => {
  const OWNER = 42;
  const employeeUser = { id: 8, activeContext: { type: 'employee', ownerId: OWNER } };

  test('connect: state ký theo id CHỦ, không phải id nhân viên', async () => {
    mockSignState.mockReturnValue({ state: 'signed-state-emp', nonce: 'n', createdAt: Date.now() });
    mockGetAuthorizeUrl.mockReturnValue('https://tiktok.com/v2/auth/authorize/?x');
    const res = mockRes();
    await controller.connect(mockReq({ user: employeeUser }), res);
    expect(mockSignState).toHaveBeenCalledWith(OWNER);
    expect(mockSignState).not.toHaveBeenCalledWith(8);
  });

  test('listAccounts: đọc tài khoản của chủ', async () => {
    mockListByUser.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.listAccounts(mockReq({ user: employeeUser }), res);
    expect(mockListByUser).toHaveBeenCalledWith(OWNER);
    expect(mockListByUser).not.toHaveBeenCalledWith(8);
  });

  test.each([
    ['refreshAccount', {}],
    ['deleteAccount', {}],
    ['testSend', { conversationId: 'c1', message: 'hi' }],
  ])('%s: tra tài khoản theo chủ workspace (findById(id, chủ)); tài khoản không thuộc chủ → 404', async (method, body) => {
    mockFindById.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller[method](mockReq({ user: employeeUser, params: { id: '1' }, body }), res);
    expect(mockFindById).toHaveBeenCalledWith(1, OWNER);
    expect(mockFindById).not.toHaveBeenCalledWith(1, 8);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('chủ tự thao tác (không có activeContext) vẫn dùng id của chính mình', async () => {
    mockListByUser.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.listAccounts(mockReq({ user: { id: 42 } }), res);
    expect(mockListByUser).toHaveBeenCalledWith(42);
  });
});
