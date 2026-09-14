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
  default: { checkBeforeAi, markRateLimitNotified: jest.fn() },
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
const getOwnerContact = jest.fn();
jest.unstable_mockModule('../../repositories/chatbot/chatbotContactAlert.repository.js', () => ({
  default: {
    getOwnerContact,
  },
}));
// Cổng khoá mua thêm chạm DB thật. Không mock thì unit test phụ thuộc Postgres cục bộ:
// máy dev có Postgres nên xanh, CI không có nên retry tới quá 5s rồi timeout.
jest.unstable_mockModule('../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn(async () => false),
  getLandingLockBySlug: jest.fn(async () => null),
  pausedLandingHtml: jest.fn(() => ''),
}));

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

// 14/09/2026: parseInt('5db50541') = 5 → link công khai /chat/<widget_key> mở nhầm chatbot số 5 của
// người khác. Tham số chỉ được coi là id số khi TOÀN BỘ chuỗi là chữ số.
describe('chatbot.controller public :chatbotId — widget_key bắt đầu bằng chữ số', () => {
  const otherOwnersChatbot = { id: 5, id_user: 99, name: 'Bot của người khác', widget_key: 'zz' };
  const myChatbot = { id: 41, id_user: 7, name: 'Bot của tôi', widget_key: '5db50541' };

  beforeEach(() => {
    jest.clearAllMocks();
    findChatbotById.mockResolvedValue(otherOwnersChatbot);
    findChatbotByWidgetKey.mockResolvedValue(myChatbot);
  });

  it('getPublicChatbotById: "5db50541" tra theo widget_key, KHÔNG gọi findChatbotById(5)', async () => {
    const res = makeRes();
    await chatbotController.getPublicChatbotById({ params: { chatbotId: '5db50541' } }, res);

    expect(findChatbotById).not.toHaveBeenCalled();
    expect(findChatbotByWidgetKey).toHaveBeenCalledWith('5db50541');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ id: 41 }) })
    );
  });

  it('chatWithCustomChatbotById: "5db50541" không rơi vào chatbot số 5', async () => {
    findChatbotByWidgetKey.mockResolvedValue(null);
    const res = makeRes();
    await chatbotController.chatWithCustomChatbotById(
      { params: { chatbotId: '5db50541' }, body: { message: 'hi', sessionId: 'sess_9', history: [] } },
      res
    );

    expect(findChatbotById).not.toHaveBeenCalled();
    expect(findChatbotByWidgetKey).toHaveBeenCalledWith('5db50541');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('getChatMessages: "5db50541" không rơi vào chatbot số 5', async () => {
    findChatbotByWidgetKey.mockResolvedValue(null);
    const res = makeRes();
    await chatbotController.getChatMessages(
      { params: { chatbotId: '5db50541' }, query: { sessionId: 'sess_9' } },
      res
    );

    expect(findChatbotById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('chuỗi toàn chữ số vẫn tra theo id, rồi mới tới widget_key', async () => {
    findChatbotById.mockResolvedValue(null);
    const res = makeRes();
    await chatbotController.getPublicChatbotById({ params: { chatbotId: '5' } }, res);

    expect(findChatbotById).toHaveBeenCalledWith(5);
    expect(findChatbotByWidgetKey).toHaveBeenCalledWith('5');
  });
});

describe('PR-1c — bot xác nhận khi khách để lại liên hệ & widget nhúng lưu hội thoại', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findChatbotById.mockResolvedValue(chatbot);
    findChatbotByWidgetKey.mockResolvedValue(chatbot);
    checkBeforeAi.mockResolvedValue({ allowed: true });
    assertAvailable.mockResolvedValue({ ok: true });
    isLimitError.mockReturnValue(false);
    maybeSetWebChatVisitorNameFromMessage.mockResolvedValue(undefined);
    addWebChatMessage.mockResolvedValue({ id: 1 });
    chat.mockResolvedValue({ content: 'Dạ em chào anh chị ạ.' });
    consume.mockResolvedValue(undefined);
    broadcast.mockReturnValue(undefined);
    resolveWidgetForChatbot.mockResolvedValue({ id: 100, widget_key: 'wk_abc' });
    getOrCreateWebChatConversation.mockResolvedValue({ id: 200 });
    isAiPaused.mockResolvedValue(false);
    getOwnerContact.mockResolvedValue({ phone: '0988888888', email: 'owner@example.com' });
  });

  it('(a) ById: tin có "số 844790999" → chat nhận note chứa 0844790999, res.json content kết thúc bằng footer, addWebChatMessage bot nhận content có footer', async () => {
    const res = makeRes();
    await chatbotController.chatWithCustomChatbotById(
      {
        params: { chatbotId: '12' },
        body: { message: 'nhắn tôi qua số 844790999', sessionId: 'sess_1', history: [] },
      },
      res
    );

    expect(chat).toHaveBeenCalledTimes(1);
    const chatCallArgs = chat.mock.calls[0][0];
    expect(chatCallArgs.extraSystemNote).toContain('0844790999');
    expect(chatCallArgs.extraSystemNote).toContain('LƯU Ý HỆ THỐNG');

    const expectedFooter = 'Đã ghi nhận số điện thoại 0844790999. Chủ doanh nghiệp sẽ liên hệ lại với bạn sớm.';
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining(expectedFooter),
        }),
      })
    );

    // addWebChatMessage called twice: 1 for visitor, 1 for assistant
    expect(addWebChatMessage).toHaveBeenCalledTimes(2);
    expect(addWebChatMessage.mock.calls[1][2]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining(expectedFooter),
      })
    );
  });

  it('(b) widget path: có sessionId → getOrCreateWebChatConversation được gọi, addWebChatMessage gọi 2 lần (visitor, assistant)', async () => {
    const res = makeRes();
    await chatbotController.chatWithCustomChatbot(
      {
        params: { widgetKey: 'wk_abc' },
        body: { message: 'xin chào tôi muốn tư vấn', sessionId: 'sess_widget_1', history: [] },
      },
      res
    );

    expect(resolveWidgetForChatbot).toHaveBeenCalledWith(chatbot, { create: true });
    expect(getOrCreateWebChatConversation).toHaveBeenCalledWith({
      userId: chatbot.id_user,
      widgetConfigId: 100,
      sessionId: 'sess_widget_1',
    });
    expect(addWebChatMessage).toHaveBeenCalledTimes(2);
    expect(addWebChatMessage.mock.calls[0][2]).toEqual(
      expect.objectContaining({ role: 'visitor', content: 'xin chào tôi muốn tư vấn' })
    );
    expect(addWebChatMessage.mock.calls[1][2]).toEqual(
      expect.objectContaining({ role: 'assistant', content: 'Dạ em chào anh chị ạ.' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          role: 'assistant',
          content: 'Dạ em chào anh chị ạ.',
          sessionId: 'sess_widget_1',
        }),
      })
    );
  });

  it('(c) widget path: không có sessionId → không gọi lưu DB, vẫn trả lời bình thường', async () => {
    const res = makeRes();
    await chatbotController.chatWithCustomChatbot(
      {
        params: { widgetKey: 'wk_abc' },
        body: { message: 'tôi hỏi thông tin', history: [] },
      },
      res
    );

    expect(getOrCreateWebChatConversation).not.toHaveBeenCalled();
    expect(addWebChatMessage).not.toHaveBeenCalled();
    expect(chat).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          role: 'assistant',
          content: 'Dạ em chào anh chị ạ.',
        }),
      })
    );
  });

  it('(d) tin không có liên hệ → chat nhận extraSystemNote null, không footer', async () => {
    const res = makeRes();
    await chatbotController.chatWithCustomChatbotById(
      {
        params: { chatbotId: '12' },
        body: { message: 'giá gói dịch vụ thế nào?', sessionId: 'sess_1', history: [] },
      },
      res
    );

    expect(chat).toHaveBeenCalledTimes(1);
    const chatCallArgs = chat.mock.calls[0][0];
    expect(chatCallArgs.extraSystemNote).toBeNull();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          role: 'assistant',
          content: 'Dạ em chào anh chị ạ.',
        }),
      })
    );
    expect(addWebChatMessage.mock.calls[1][2].content).toBe('Dạ em chào anh chị ạ.');
  });

  it('(e) tin có SĐT trùng SĐT của chủ shop → loại bỏ, không note, không footer', async () => {
    const res = makeRes();
    await chatbotController.chatWithCustomChatbotById(
      {
        params: { chatbotId: '12' },
        body: { message: 'gọi lại cho tôi số 0988888888 nhé', sessionId: 'sess_1', history: [] },
      },
      res
    );

    expect(getOwnerContact).toHaveBeenCalledWith(chatbot.id_user);
    expect(chat).toHaveBeenCalledTimes(1);
    const chatCallArgs = chat.mock.calls[0][0];
    expect(chatCallArgs.extraSystemNote).toBeNull();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          content: 'Dạ em chào anh chị ạ.',
        }),
      })
    );
    expect(res.json.mock.calls[0][0].data.content).not.toContain('Đã ghi nhận');
  });
});
