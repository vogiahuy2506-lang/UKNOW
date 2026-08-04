import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findChatbotById = jest.fn();
const findChatbotByWidgetKey = jest.fn();
const resolveWidgetForChatbot = jest.fn();
const getOrCreateWebChatConversation = jest.fn();
const addWebChatMessage = jest.fn();
const maybeSetWebChatVisitorNameFromMessage = jest.fn();
const findActiveWebChatConversationId = jest.fn();
const getAgentWebChatMessagesAfter = jest.fn();

const checkBeforeAi = jest.fn();
const isAiPaused = jest.fn();
const chat = jest.fn();
const assertAvailable = jest.fn();
const consume = jest.fn();
const isLimitError = jest.fn();
const broadcast = jest.fn();

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById,
    findChatbotByWidgetKey,
    resolveWidgetForChatbot,
    getOrCreateWebChatConversation,
    addWebChatMessage,
    maybeSetWebChatVisitorNameFromMessage,
    findActiveWebChatConversationId,
    getAgentWebChatMessagesAfter,
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
  default: { assertAvailable, consume, isLimitError },
  VISITOR_CHAT_ERROR_MESSAGE: 'err',
  VISITOR_CHAT_UNAVAILABLE_MESSAGE: 'unavail',
}));
jest.unstable_mockModule('../../services/ai/customChat.service.js', () => ({
  default: { chat },
}));
jest.unstable_mockModule('../../services/chatbot/chatbotRateLimit.service.js', () => ({
  default: { checkBeforeAi },
}));
jest.unstable_mockModule('../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: { isAiPaused },
}));
jest.unstable_mockModule('../../services/sse.service.js', () => ({
  default: { broadcast },
}));
jest.unstable_mockModule('../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  default: {},
  AUDIT_ACTIONS: {},
  AUDIT_ENTITY_TYPES: {},
}));
jest.unstable_mockModule('../../services/chatbot/zaloInbox.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/channelAdapters/zaloOA.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../../services/chatbot/channelAdapters/facebook.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../../repositories/payment/plan.repository.js', () => ({
  getPlanByUserId: jest.fn(),
}));
jest.unstable_mockModule('../upload.controller.js', () => ({ default: {} }));

const { default: chatbotController } = await import('../chatbot.controller.js');

const chatbot = {
  id: 12,
  id_user: 7,
  name: 'Bot',
  widget_key: 'wk_abc',
  // custom_chatbots has no id_sub_assistant — undefined forever
};

const makeRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
};

describe('chatbot.controller webchat widget resolve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findChatbotById.mockResolvedValue(chatbot);
    findChatbotByWidgetKey.mockResolvedValue(null);
    checkBeforeAi.mockResolvedValue({ allowed: true });
    assertAvailable.mockResolvedValue({ ok: true });
    isLimitError.mockReturnValue(false);
    maybeSetWebChatVisitorNameFromMessage.mockResolvedValue(undefined);
    addWebChatMessage.mockResolvedValue({ id: 1 });
    chat.mockResolvedValue({ content: 'xin chào' });
    consume.mockResolvedValue(undefined);
    broadcast.mockReturnValue(undefined);
  });

  it('reuses one widget across two chats (no id_sub_assistant match)', async () => {
    const widget = { id: 100, widget_key: 'wk_abc' };
    const conv = { id: 200 };
    resolveWidgetForChatbot.mockResolvedValue(widget);
    getOrCreateWebChatConversation.mockResolvedValue(conv);
    isAiPaused.mockResolvedValue(false);

    const req = {
      params: { chatbotId: '12' },
      body: { message: 'hi', sessionId: 'sess_1', history: [] },
    };

    await chatbotController.chatWithCustomChatbotById(req, makeRes());
    await chatbotController.chatWithCustomChatbotById(req, makeRes());

    expect(resolveWidgetForChatbot).toHaveBeenCalledTimes(2);
    expect(resolveWidgetForChatbot).toHaveBeenCalledWith(chatbot, { create: true });
    expect(getOrCreateWebChatConversation).toHaveBeenCalledTimes(2);
    expect(getOrCreateWebChatConversation.mock.calls.every(
      ([arg]) => arg.widgetConfigId === 100 && arg.sessionId === 'sess_1'
    )).toBe(true);
  });

  it('returns aiPaused without calling Gemini when handoff is active', async () => {
    resolveWidgetForChatbot.mockResolvedValue({ id: 100, widget_key: 'wk_abc' });
    getOrCreateWebChatConversation.mockResolvedValue({ id: 200 });
    isAiPaused.mockResolvedValue(true);

    const res = makeRes();
    await chatbotController.chatWithCustomChatbotById(
      { params: { chatbotId: '12' }, body: { message: 'hi', sessionId: 'sess_1' } },
      res
    );

    expect(chat).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ aiPaused: true, sessionId: 'sess_1' }),
      })
    );
  });

  it('getChatMessages finds agent replies via resolveWidgetForChatbot', async () => {
    resolveWidgetForChatbot.mockResolvedValue({ id: 100 });
    findActiveWebChatConversationId.mockResolvedValue(55);
    getAgentWebChatMessagesAfter.mockResolvedValue([
      { id: 9, role: 'agent', content: 'từ chủ shop', created_at: '2026-08-04T00:00:00Z' },
    ]);

    const res = makeRes();
    await chatbotController.getChatMessages(
      { params: { chatbotId: '12' }, query: { sessionId: 'sess_1' } },
      res
    );

    expect(resolveWidgetForChatbot).toHaveBeenCalledWith(chatbot, { create: false });
    expect(findActiveWebChatConversationId).toHaveBeenCalledWith({
      widgetConfigId: 100,
      sessionId: 'sess_1',
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        messages: [
          {
            id: 9,
            role: 'assistant',
            content: 'từ chủ shop',
            createdAt: '2026-08-04T00:00:00Z',
          },
        ],
        sessionId: 'sess_1',
      },
    });
  });

  it('getChatMessages returns empty when widget missing (create:false)', async () => {
    resolveWidgetForChatbot.mockResolvedValue(null);
    const res = makeRes();
    await chatbotController.getChatMessages(
      { params: { chatbotId: '12' }, query: { sessionId: 'sess_1' } },
      res
    );
    expect(findActiveWebChatConversationId).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { messages: [], sessionId: 'sess_1' },
    });
  });
});
