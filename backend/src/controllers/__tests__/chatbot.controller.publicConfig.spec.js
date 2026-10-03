/**
 * Hai endpoint công khai (không đăng nhập) trả cấu hình chatbot cho widget / trang /chat/:id:
 *   GET /api/chatbot-public/chatbot/:chatbotId          → getPublicChatbotById
 *   GET /api/chatbot-public/custom-chatbot/:key/config  → getCustomChatbotConfig
 * Không được lộ câu lệnh hệ thống (system_instruction) của chủ chatbot, ở bất kỳ dạng tên nào.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findChatbotById = jest.fn();
const findChatbotByWidgetKey = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById,
    findChatbotByWidgetKey,
  },
}));
jest.unstable_mockModule('../../services/chatbot/knowledgeBase.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/subAssistant.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/chatRouter.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/ragEngine.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(),
}));
jest.unstable_mockModule('../../services/ai/aiCreditMeter.service.js', () => ({
  default: { assertAvailable: jest.fn(), consume: jest.fn(), isLimitError: jest.fn() },
  VISITOR_CHAT_ERROR_MESSAGE: 'err',
  VISITOR_CHAT_UNAVAILABLE_MESSAGE: 'unavail',
}));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({
  default: { chat: jest.fn() },
}));
jest.unstable_mockModule('../../services/chatbot/chatbotRateLimit.service.js', () => ({
  default: { checkBeforeAi: jest.fn(), markRateLimitNotified: jest.fn() },
}));
jest.unstable_mockModule('../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: { isAiPaused: jest.fn() },
}));
jest.unstable_mockModule('../../services/sse.service.js', () => ({
  default: { broadcast: jest.fn() },
}));
jest.unstable_mockModule('../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: {},
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
  logWorkspace: jest.fn(),
}));
jest.unstable_mockModule('../../services/chatbot/zaloInbox.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/channelAdapters/zaloOA.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/channelAdapters/facebook.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/payment/plan.repository.js', () => ({
  getPlanByUserId: jest.fn(),
}));
jest.unstable_mockModule('../../services/chatbot/whatsappBaileys.service.js', () => ({
  default: {},
  listSessions: jest.fn(() => []),
  listPersistedSessions: jest.fn(async () => []),
}));
jest.unstable_mockModule('../../repositories/chatbot/chatbotContactAlert.repository.js', () => ({
  default: { getOwnerContact: jest.fn() },
}));
// Cổng khoá mua thêm chạm DB thật — mock để unit test không cần Postgres.
jest.unstable_mockModule('../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn(async () => false),
  getLandingLockBySlug: jest.fn(async () => null),
  pausedLandingHtml: jest.fn(() => ''),
}));

const { default: chatbotController } = await import('../chatbot.controller.js');

const SECRET_PROMPT = 'Bí mật kinh doanh: giảm 30% nếu khách hỏi mã NOIBO.';
const chatbotRow = {
  id: 12,
  id_user: 7,
  name: 'Bot bán hàng',
  widget_key: 'wk_public',
  is_active: true,
  greeting_msg: 'Xin chào!',
  system_instruction: SECRET_PROMPT,
  ai_model: 'gemini-2.5-flash',
  response_style: 'friendly',
  temperature: 0.4,
  max_tokens: 1024,
};

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};

function expectNoSystemInstruction(payload) {
  const data = payload.data;
  expect(data).not.toHaveProperty('system_instruction');
  expect(data).not.toHaveProperty('systemInstruction');
  expect(JSON.stringify(payload)).not.toContain(SECRET_PROMPT);
}

describe('public chatbot config — không lộ system_instruction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findChatbotById.mockResolvedValue(chatbotRow);
    findChatbotByWidgetKey.mockResolvedValue(chatbotRow);
  });

  it('getPublicChatbotById', async () => {
    const res = makeRes();
    await chatbotController.getPublicChatbotById({ params: { chatbotId: '12' } }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    // Các trường widget/trang /chat/:id đang dùng vẫn còn. `ai_model` KHÔNG còn ở API công khai
    // (main bỏ từ 09/2026: model do hệ thống chọn, id chatbot tuần tự nên lộ model = gom được cấu hình).
    expect(payload.data).toEqual(expect.objectContaining({
      id: 12, name: 'Bot bán hàng', welcome_message: 'Xin chào!',
    }));
    expect(payload.data).not.toHaveProperty('ai_model');
    expectNoSystemInstruction(payload);
  });

  it('getCustomChatbotConfig', async () => {
    const res = makeRes();
    await chatbotController.getCustomChatbotConfig({ params: { widgetKey: 'wk_public' } }, res);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual(expect.objectContaining({
      widgetKey: 'wk_public', name: 'Bot bán hàng', welcomeMessage: 'Xin chào!',
    }));
    expectNoSystemInstruction(payload);
  });
});
