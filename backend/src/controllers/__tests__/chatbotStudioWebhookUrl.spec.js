import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindChatbotById = jest.fn();
const mockUpsertChannel = jest.fn();
const mockLogWorkspace = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById: mockFindChatbotById,
  },
}));

jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({
  default: {
    upsertChannel: mockUpsertChannel,
  },
}));

jest.unstable_mockModule('../../services/chatbot/whatsappBaileys.service.js', () => ({
  default: {},
  sendMessage: jest.fn(),
  listSessions: jest.fn(() => []),
  listPersistedSessions: jest.fn(async () => []),
}));

jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: {},
  getAuditContext: jest.fn(() => ({})),
  getWorkspaceAuditContext: jest.fn(() => ({})),
  logWorkspace: mockLogWorkspace,
  AUDIT_ACTIONS: { CHATBOT_CHANNEL_CONNECTED: 'chatbot_channel_connected' },
  AUDIT_ENTITY_TYPES: { CHATBOT_CHANNEL: 'chatbot_channel' },
}));

const { default: chatbotController } = await import('../chatbot.controller.js');

describe('ChatbotController — Studio Webhook URL format (/api/webhooks/chatbot/...)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      BACKEND_PUBLIC_URL: 'https://api.uknow.vn',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const createMockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('connectChatbotFacebook sinh đúng URL Studio /api/webhooks/chatbot/facebook/:token', async () => {
    mockFindChatbotById.mockResolvedValue({ id: 88, name: 'Bot FB' });
    mockUpsertChannel.mockImplementation(async (chatbotId, channelType, data) => ({
      id: 501,
      display_name: data.display_name,
      webhook_url: data.webhook_url,
    }));

    const req = {
      params: { chatbotId: '88' },
      user: { id: 1, id_user: 1 },
      body: {
        page_access_token: 'pat_123',
        page_id: 'page_456',
        page_name: 'Fanpage Shop',
      },
    };
    const res = createMockRes();

    await chatbotController.connectChatbotFacebook(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.success).toBe(true);

    const upsertCall = mockUpsertChannel.mock.calls[0];
    expect(upsertCall[0]).toBe(88);
    expect(upsertCall[1]).toBe('facebook');

    const passedData = upsertCall[2];
    // Khẳng định đường URL đúng định dạng Studio có tiền tố /chatbot/
    expect(passedData.webhook_url).toMatch(/^https:\/\/api\.uknow\.vn\/api\/webhooks\/chatbot\/facebook\/[0-9a-f]{64}$/);
    // Khẳng định KHÔNG phải đường chết cũ /api/webhooks/facebook/:token
    expect(passedData.webhook_url).not.toMatch(/^https:\/\/api\.uknow\.vn\/api\/webhooks\/facebook\//);
  });

  it('connectChatbotZaloOA sinh đúng URL Studio /api/webhooks/chatbot/zalo-oa/:token', async () => {
    mockFindChatbotById.mockResolvedValue({ id: 99, name: 'Bot Zalo' });
    mockUpsertChannel.mockImplementation(async (chatbotId, channelType, data) => ({
      id: 502,
      display_name: data.display_name,
      webhook_url: data.webhook_url,
    }));

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({ access_token: 'zalo_at_123', expires_in: 3600 }),
    });

    try {
      const req = {
        params: { chatbotId: '99' },
        user: { id: 1, id_user: 1 },
        body: {
          zalo_app_id: 'app_123',
          zalo_app_secret: 'secret_456',
          display_name: 'Zalo OA Shop',
        },
      };
      const res = createMockRes();

      await chatbotController.connectChatbotZaloOA(req, res);

      expect(res.json).toHaveBeenCalledTimes(1);
      const responseData = res.json.mock.calls[0][0];
      expect(responseData.success).toBe(true);

      const upsertCall = mockUpsertChannel.mock.calls[0];
      expect(upsertCall[0]).toBe(99);
      expect(upsertCall[1]).toBe('zalo_oa');

      const passedData = upsertCall[2];
      // Khẳng định đường URL đúng định dạng Studio có tiền tố /chatbot/
      expect(passedData.webhook_url).toMatch(/^https:\/\/api\.uknow\.vn\/api\/webhooks\/chatbot\/zalo-oa\/[0-9a-f]{64}$/);
      // Khẳng định KHÔNG phải đường chết cũ /api/webhooks/zalo-oa/:token
      expect(passedData.webhook_url).not.toMatch(/^https:\/\/api\.uknow\.vn\/api\/webhooks\/zalo-oa\//);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
