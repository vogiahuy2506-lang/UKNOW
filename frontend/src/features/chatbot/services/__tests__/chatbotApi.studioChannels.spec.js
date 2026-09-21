/**
 * Unit tests for Chatbot Studio Channels API methods:
 * - getFacebookPageConfig
 * - saveFacebookPageConfig
 * - getZaloOaConfig
 * - saveZaloOaConfig
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock('../../../../services/api', () => ({
  default: {
    post: (...args) => mockPost(...args),
    get: (...args) => mockGet(...args),
  },
}));
vi.mock('../../../../services/chatbotApi', () => ({
  default: {},
}));

const chatbotApi = (await import('../chatbotApi.service.js')).default;

describe('chatbotApi studio channels endpoints', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
  });

  describe('Facebook Page config', () => {
    it('getFacebookPageConfig() calls channels API and filters facebook channel', async () => {
      mockGet.mockResolvedValue({
        data: {
          success: true,
          data: [
            { id: 1, channel_type: 'zalo_oa', display_name: 'Zalo' },
            { id: 2, channel_type: 'facebook', display_name: 'FB Page', is_active: true, webhook_url: 'https://uknow.vn/fb/hook' },
          ],
        },
      });

      const res = await chatbotApi.getFacebookPageConfig(42);

      expect(mockGet).toHaveBeenCalledWith('/ai/chatbot/custom-chatbots/42/channels');
      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        id: 2,
        channel_type: 'facebook',
        display_name: 'FB Page',
        is_active: true,
        webhook_url: 'https://uknow.vn/fb/hook',
      });
    });

    it('getFacebookPageConfig() returns data: null when no active facebook channel exists', async () => {
      mockGet.mockResolvedValue({
        data: {
          success: true,
          data: [],
        },
      });

      const res = await chatbotApi.getFacebookPageConfig(42);
      expect(res.data).toBeNull();
    });

    it('saveFacebookPageConfig() POSTs to channels/facebook and returns response.data', async () => {
      mockPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 10,
            webhook_url: 'https://backend/api/webhooks/chatbot/facebook/token123',
            verify_token: 'sec_xyz',
          },
          message: 'Facebook Page đã được kết nối',
        },
      });

      const payload = { page_id: 'pid_1', page_access_token: 'tok_1', page_name: 'Name 1' };
      const res = await chatbotApi.saveFacebookPageConfig(42, payload);

      expect(mockPost).toHaveBeenCalledWith(
        '/ai/chatbot/custom-chatbots/42/channels/facebook',
        payload
      );
      expect(res.data.verify_token).toBe('sec_xyz');
      expect(res.data.webhook_url).toBe('https://backend/api/webhooks/chatbot/facebook/token123');
    });
  });

  describe('Zalo OA config', () => {
    it('getZaloOaConfig() calls channels API and filters zalo_oa channel', async () => {
      mockGet.mockResolvedValue({
        data: {
          success: true,
          data: [
            { id: 1, channel_type: 'zalo_oa', display_name: 'Zalo OA 1', is_active: true, webhook_url: 'https://uknow.vn/zalo/hook' },
            { id: 2, channel_type: 'facebook', display_name: 'FB Page' },
          ],
        },
      });

      const res = await chatbotApi.getZaloOaConfig(42);

      expect(mockGet).toHaveBeenCalledWith('/ai/chatbot/custom-chatbots/42/channels');
      expect(res.success).toBe(true);
      expect(res.data).toEqual({
        id: 1,
        channel_type: 'zalo_oa',
        display_name: 'Zalo OA 1',
        is_active: true,
        webhook_url: 'https://uknow.vn/zalo/hook',
      });
    });

    it('getZaloOaConfig() returns data: null when no active zalo_oa channel exists', async () => {
      mockGet.mockResolvedValue({
        data: {
          success: true,
          data: [],
        },
      });

      const res = await chatbotApi.getZaloOaConfig(42);
      expect(res.data).toBeNull();
    });

    it('saveZaloOaConfig() POSTs to channels/zalo-oa and returns response.data', async () => {
      mockPost.mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 20,
            webhook_url: 'https://backend/api/webhooks/chatbot/zalo-oa/token456',
          },
          message: 'Zalo OA đã được kết nối',
        },
      });

      const payload = { zalo_app_id: 'zid_1', zalo_app_secret: 'zsec_1' };
      const res = await chatbotApi.saveZaloOaConfig(42, payload);

      expect(mockPost).toHaveBeenCalledWith(
        '/ai/chatbot/custom-chatbots/42/channels/zalo-oa',
        payload
      );
      expect(res.data.webhook_url).toBe('https://backend/api/webhooks/chatbot/zalo-oa/token456');
    });
  });
});
