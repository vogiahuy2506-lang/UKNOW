import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const mockUpsertChannel = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    upsertChannel: mockUpsertChannel,
  },
}));

const { default: oauthController } = await import('../oauth.controller.js');

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

  describe('handleFacebookCallback', () => {
    it('1.1 State hợp lệ (chatbot_id + redirect_to=studio) → đi tiếp luồng Studio, không gọi upsertChannel', async () => {
      const stateObj = { chatbot_id: 101, redirect_to: 'studio' };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
      const stateObj = { redirect_to: 'studio' }; // thiếu chatbot_id
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
      const stateObj = { chatbot_id: 101, redirect_to: 'settings' };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
      const stateObj = { chatbot_id: 101 };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
  });

  describe('handleZaloCallback', () => {
    it('2.1 State hợp lệ (chatbot_id + redirect_to=studio) → đi tiếp luồng Studio, không gọi upsertChannel', async () => {
      const stateObj = { chatbot_id: 202, redirect_to: 'studio' };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
      const stateObj = { redirect_to: 'studio' }; // thiếu chatbot_id
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
      const stateObj = { chatbot_id: 202, redirect_to: 'settings' };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
      const stateObj = { chatbot_id: 202 };
      const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
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
  });
});
