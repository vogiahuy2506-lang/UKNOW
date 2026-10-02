import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import crypto from 'crypto';

const mockUpsertChannel = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    upsertChannel: mockUpsertChannel,
  },
}));

const { default: oauthController } = await import('../oauth.controller.js');
const { signState } = await import('../../services/chatbot/whatsappOAuth.service.js');

const TEST_STATE_SECRET = 'test-oauth-state-secret';

/**
 * Tự dựng token cùng định dạng signState (`base64url(payload).base64url(hmac)`) để giả các ca
 * sai khoá / hết hạn / sửa payload.
 */
function craftState(payload, secret = TEST_STATE_SECRET) {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

const futureExp = () => Math.floor(Date.now() / 1000) + 600;

describe('OAuthController — Chốt chặn OAuth callback (bắt buộc chatbot_id + redirect_to=studio)', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      FRONTEND_URL: 'http://localhost:5174',
      FACEBOOK_APP_ID: 'fb_app_123',
      FACEBOOK_APP_SECRET: 'fb_secret_456',
      OAUTH_CALLBACK_URL: 'http://localhost:5001/api/webhooks/oauth/callback',
      ZALO_OA_APP_ID: 'zalo_app_789',
      ZALO_OA_APP_SECRET: 'zalo_secret_012',
      OAUTH_STATE_SECRET: TEST_STATE_SECRET,
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  const createMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.redirect = jest.fn().mockReturnValue(res);
    return res;
  };

  const facebookState = (payload) => signState({ flow: 'facebook_oauth', ...payload });
  const zaloState = (payload) => signState({ flow: 'zalo_oa_oauth', ...payload });

  describe('handleFacebookCallback', () => {
    it('1.1 State hợp lệ (chatbot_id + redirect_to=studio) → đi tiếp luồng Studio, không gọi upsertChannel', async () => {
      const state = facebookState({ chatbot_id: 101, redirect_to: 'studio' });
      const req = {
        query: {
          code: 'fb_test_code',
          state,
        },
      };
      const res = createMockRes();

      global.fetch
        // 1. exchange code
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ access_token: 'short_token_123' }),
        })
        // 2. exchange long-lived
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ access_token: 'long_token_456' }),
        })
        // 3. get pages
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({
            data: [{ id: 'page_999', name: 'My Test Page', access_token: 'long_token_456' }],
          }),
        });

      await oauthController.handleFacebookCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('http://localhost:5174/studio/chatbot/101');
      expect(redirectUrl).toContain('chatbot_id=101');
      expect(redirectUrl).toContain('facebook_pages=');

      // Chứng minh KHÔNG còn ghi vào bảng channel_connections cũ
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it('1.2 State thiếu chatbot_id → redirect chứa error=missing_chatbot, không gọi fetch hay upsertChannel', async () => {
      const state = facebookState({ redirect_to: 'studio' }); // thiếu chatbot_id
      const req = {
        query: {
          code: 'fb_test_code',
          state,
        },
      };
      const res = createMockRes();

      await oauthController.handleFacebookCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=missing_chatbot');
      expect(redirectUrl).toContain('http://localhost:5174/app/chatbot-studio');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it('1.3 State có redirect_to khác studio → redirect chứa error=missing_chatbot, không gọi upsertChannel', async () => {
      const state = facebookState({ chatbot_id: 101, redirect_to: 'settings' });
      const req = {
        query: {
          code: 'fb_test_code',
          state,
        },
      };
      const res = createMockRes();

      await oauthController.handleFacebookCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=missing_chatbot');
      expect(redirectUrl).toContain('http://localhost:5174/app/chatbot-studio');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it('1.4 State không có redirect_to → redirect chứa error=missing_chatbot, không gọi upsertChannel', async () => {
      const state = facebookState({ chatbot_id: 101 });
      const req = {
        query: {
          code: 'fb_test_code',
          state,
        },
      };
      const res = createMockRes();

      await oauthController.handleFacebookCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=missing_chatbot');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    describe('1.5 State không qua được kiểm chữ ký → error=invalid_state, không gọi Facebook', () => {
      it.each([
        [
          'state base64 JSON không ký (định dạng cũ)',
          () => Buffer.from(JSON.stringify({ chatbot_id: 101, redirect_to: 'studio' })).toString('base64'),
        ],
        [
          'ký bằng khoá khác',
          () => craftState({ flow: 'facebook_oauth', chatbot_id: 101, redirect_to: 'studio', exp: futureExp() }, 'other-secret'),
        ],
        [
          'payload bị sửa sau khi ký',
          () => {
            const [, sig] = facebookState({ chatbot_id: 101, redirect_to: 'studio' }).split('.');
            const forged = Buffer.from(JSON.stringify({
              flow: 'facebook_oauth', chatbot_id: 999, redirect_to: 'studio', exp: futureExp(),
            })).toString('base64url');
            return `${forged}.${sig}`;
          },
        ],
        [
          'state đã hết hạn',
          () => craftState({ flow: 'facebook_oauth', chatbot_id: 101, redirect_to: 'studio', exp: Math.floor(Date.now() / 1000) - 5 }),
        ],
        [
          'state của luồng Zalo OA',
          () => zaloState({ chatbot_id: 101, redirect_to: 'studio' }),
        ],
        ['thiếu state', () => undefined],
      ])('%s', async (_label, makeState) => {
        const req = { query: { code: 'fb_test_code', state: makeState() } };
        const res = createMockRes();

        await oauthController.handleFacebookCallback(req, res);

        expect(res.redirect).toHaveBeenCalledWith('http://localhost:5174/app/chatbot-studio?error=invalid_state');
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    it('1.6 Thiếu cả OAUTH_STATE_SECRET lẫn JWT_SECRET → error=invalid_state (không crash, không gọi Facebook)', async () => {
      const state = craftState({ flow: 'facebook_oauth', chatbot_id: 101, redirect_to: 'studio', exp: futureExp() });
      delete process.env.OAUTH_STATE_SECRET;
      delete process.env.JWT_SECRET;
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const req = { query: { code: 'fb_test_code', state } };
      const res = createMockRes();

      await oauthController.handleFacebookCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:5174/app/chatbot-studio?error=invalid_state');
      expect(global.fetch).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('initFacebookOAuth', () => {
    it('2.0 auth_url mang state ĐÃ KÝ, callback kiểm được và đọc lại đúng chatbot_id/redirect_to', async () => {
      const req = { user: { id: 7 }, query: { chatbot_id: '55', redirect_to: 'studio' } };
      const res = createMockRes();

      await oauthController.initFacebookOAuth(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      const stateInUrl = new URL(body.auth_url).searchParams.get('state');
      expect(stateInUrl).toBe(body.state);
      expect(stateInUrl).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

      const cbRes = createMockRes();
      await oauthController.handleFacebookCallback({ query: { code: 'x', state: stateInUrl } }, cbRes);
      // Qua được kiểm chữ ký → đi tới bước đổi code (fetch được gọi), không phải invalid_state
      expect(cbRes.redirect).not.toHaveBeenCalledWith(expect.stringContaining('invalid_state'));
      expect(global.fetch).toHaveBeenCalled();
      expect(String(global.fetch.mock.calls[0][0])).toContain('graph.facebook.com');
    });

    it('2.0b Thiếu cả OAUTH_STATE_SECRET lẫn JWT_SECRET → 500, không trả auth_url', async () => {
      delete process.env.OAUTH_STATE_SECRET;
      delete process.env.JWT_SECRET;
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const req = { user: { id: 7 }, query: { chatbot_id: '55', redirect_to: 'studio' } };
      const res = createMockRes();

      await oauthController.initFacebookOAuth(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].auth_url).toBeUndefined();
      errorSpy.mockRestore();
    });
  });

  describe('handleZaloCallback', () => {
    it('2.1 State hợp lệ (chatbot_id + redirect_to=studio) → đi tiếp luồng Studio, không gọi upsertChannel', async () => {
      const state = zaloState({ chatbot_id: 202, redirect_to: 'studio' });
      const req = {
        query: {
          code: 'zalo_test_code',
          state,
        },
      };
      const res = createMockRes();

      global.fetch
        // 1. exchange code
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ access_token: 'zalo_access_token_abc' }),
        })
        // 2. get OA profile
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ name: 'Zalo OA Shop' }),
        });

      await oauthController.handleZaloCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('http://localhost:5174/studio/chatbot/202');
      expect(redirectUrl).toContain('chatbot_id=202');
      expect(redirectUrl).toContain('oa_name=Zalo%20OA%20Shop');

      // Chứng minh KHÔNG còn ghi vào bảng channel_connections cũ
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it('2.2 State thiếu chatbot_id → redirect chứa error=missing_chatbot, không gọi fetch hay upsertChannel', async () => {
      const state = zaloState({ redirect_to: 'studio' }); // thiếu chatbot_id
      const req = {
        query: {
          code: 'zalo_test_code',
          state,
        },
      };
      const res = createMockRes();

      await oauthController.handleZaloCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=missing_chatbot');
      expect(redirectUrl).toContain('http://localhost:5174/app/chatbot-studio');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it('2.3 State có redirect_to khác studio → redirect chứa error=missing_chatbot, không gọi upsertChannel', async () => {
      const state = zaloState({ chatbot_id: 202, redirect_to: 'settings' });
      const req = {
        query: {
          code: 'zalo_test_code',
          state,
        },
      };
      const res = createMockRes();

      await oauthController.handleZaloCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=missing_chatbot');
      expect(redirectUrl).toContain('http://localhost:5174/app/chatbot-studio');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it('2.4 State không có redirect_to → redirect chứa error=missing_chatbot, không gọi upsertChannel', async () => {
      const state = zaloState({ chatbot_id: 202 });
      const req = {
        query: {
          code: 'zalo_test_code',
          state,
        },
      };
      const res = createMockRes();

      await oauthController.handleZaloCallback(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = res.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=missing_chatbot');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpsertChannel).not.toHaveBeenCalled();
    });

    it.each([
      [
        'state base64 JSON không ký (định dạng cũ)',
        () => Buffer.from(JSON.stringify({ chatbot_id: 202, redirect_to: 'studio' })).toString('base64'),
      ],
      [
        'ký bằng khoá khác',
        () => craftState({ flow: 'zalo_oa_oauth', chatbot_id: 202, redirect_to: 'studio', exp: futureExp() }, 'other-secret'),
      ],
      [
        'state đã hết hạn',
        () => craftState({ flow: 'zalo_oa_oauth', chatbot_id: 202, redirect_to: 'studio', exp: Math.floor(Date.now() / 1000) - 5 }),
      ],
      [
        'state của luồng Facebook',
        () => facebookState({ chatbot_id: 202, redirect_to: 'studio' }),
      ],
    ])('2.5 %s → error=invalid_state, không gọi Zalo', async (_label, makeState) => {
      const req = { query: { code: 'zalo_test_code', state: makeState() } };
      const res = createMockRes();

      await oauthController.handleZaloCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:5174/app/chatbot-studio?error=invalid_state');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('initZaloOAuth', () => {
    it('2.6 auth_url mang state ĐÃ KÝ, callback kiểm được', async () => {
      const req = { user: { id: 7 }, query: { chatbot_id: '66', redirect_to: 'studio' } };
      const res = createMockRes();

      await oauthController.initZaloOAuth(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.success).toBe(true);
      const stateInUrl = new URL(body.auth_url).searchParams.get('state');
      expect(stateInUrl).toBe(body.state);

      global.fetch
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ access_token: 'zalo_at' }) })
        .mockResolvedValueOnce({ json: jest.fn().mockResolvedValue({ name: 'OA' }) });
      const cbRes = createMockRes();
      await oauthController.handleZaloCallback({ query: { code: 'z', state: stateInUrl } }, cbRes);
      expect(cbRes.redirect.mock.calls[0][0]).toContain('/studio/chatbot/66');
    });
  });

  describe('handleWhatsAppCallback', () => {
    it('3.1 State Facebook dùng cho callback WhatsApp → invalid_state', async () => {
      const req = { query: { code: 'wa_code', state: facebookState({ chatbot_id: 1, redirect_to: 'studio' }) } };
      const res = createMockRes();

      await oauthController.handleWhatsAppCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:5174/oauth-result.html?whatsapp_oauth=invalid_state');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('3.2 Thiếu cả OAUTH_STATE_SECRET lẫn JWT_SECRET → callback_error, không crash', async () => {
      delete process.env.OAUTH_STATE_SECRET;
      delete process.env.JWT_SECRET;
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const req = { query: { code: 'wa_code', state: 'abc.def' } };
      const res = createMockRes();

      await oauthController.handleWhatsAppCallback(req, res);

      expect(res.redirect).toHaveBeenCalledWith('http://localhost:5174/oauth-result.html?whatsapp_oauth=callback_error');
      errorSpy.mockRestore();
    });
  });
});
