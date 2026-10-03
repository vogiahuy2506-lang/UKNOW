import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const mockFindByWebhookToken = jest.fn();
const mockGetOrCreateConversation = jest.fn();
const mockAddMessage = jest.fn();
const mockUpdateLastActivity = jest.fn();
const mockFindActiveChannelById = jest.fn();
const mockGetLatestMessageId = jest.fn();
const mockFindChatbotById = jest.fn();
const mockIsAiPaused = jest.fn();
const mockCheckBeforeAi = jest.fn();
const mockMarkRateLimitNotified = jest.fn();
const mockRouteChatbotMessage = jest.fn();
const mockParseWebhookEvent = jest.fn();
const mockSendReply = jest.fn();
const mockFbParseWebhookEvent = jest.fn();
const mockFbSendReply = jest.fn();
const mockWaSendReply = jest.fn();
const mockWaIsEnabledForChatbot = jest.fn();

jest.unstable_mockModule('../../services/chatbot/channelAdapters/whatsapp.adapter.js', () => ({
  default: {
    parseWebhookEvent: jest.fn(() => []),
    verifySignature: jest.fn(() => true),
    sendReply: mockWaSendReply,
  },
}));

jest.unstable_mockModule('../../repositories/chatbot/chatbotWhatsAppAccount.repository.js', () => ({
  default: {
    isEnabledForChatbot: mockWaIsEnabledForChatbot,
  },
}));

jest.unstable_mockModule('../../repositories/ai/chatbotChannel.repository.js', () => ({
  default: {
    findByWebhookToken: mockFindByWebhookToken,
    getOrCreateConversation: mockGetOrCreateConversation,
    addMessage: mockAddMessage,
    updateLastActivity: mockUpdateLastActivity,
    findActiveChannelById: mockFindActiveChannelById,
    getLatestMessageId: mockGetLatestMessageId,
  },
}));

jest.unstable_mockModule('../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    findChatbotById: mockFindChatbotById,
  },
}));

jest.unstable_mockModule('../../repositories/ai/unifiedInbox.repository.js', () => ({
  default: {
    isAiPaused: mockIsAiPaused,
  },
}));

jest.unstable_mockModule('../../services/chatbot/chatbotRateLimit.service.js', () => ({
  default: {
    checkBeforeAi: mockCheckBeforeAi,
    markRateLimitNotified: mockMarkRateLimitNotified,
    // Kho khoá dùng chung với chatbotActiveHours.service (câu ngoài giờ gửi 1 lần).
    hasKey: jest.fn().mockResolvedValue(false),
    setKeyWithTtl: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.unstable_mockModule('../../services/chatbot/channelAdapters/facebook.adapter.js', () => ({
  default: {
    parseWebhookEvent: mockFbParseWebhookEvent,
    sendReply: mockFbSendReply,
  },
}));

jest.unstable_mockModule('../../services/chatbot/chatRouter.service.js', () => ({
  default: {
    routeChatbotMessage: mockRouteChatbotMessage,
  },
}));

jest.unstable_mockModule('../../services/chatbot/channelAdapters/zaloOA.adapter.js', () => ({
  default: {
    parseWebhookEvent: mockParseWebhookEvent,
    sendReply: mockSendReply,
  },
}));

jest.unstable_mockModule('../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: jest.fn().mockResolvedValue(false),
}));

const { default: chatbotChannelWebhookController } = await import('../chatbotChannelWebhook.controller.js');
const { default: inboundReplyDebounceService } = await import('../../services/chatbot/inboundReplyDebounce.service.js');

describe('ChatbotChannelWebhookController - Zalo OA Debounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    inboundReplyDebounceService._resetForTests();
    jest.clearAllMocks();
    process.env.CHATBOT_INBOUND_DEBOUNCE_MS = '6000';
    process.env.CHATBOT_INBOUND_MAX_WAIT_MS = '10000';
  });

  afterEach(() => {
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
    delete process.env.CHATBOT_INBOUND_DEBOUNCE_MS;
    delete process.env.CHATBOT_INBOUND_MAX_WAIT_MS;
  });

  it('responds ok immediately, saves visitor message, and aggregates burst into 1 AI reply', async () => {
    const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
    const chatbot = { id: 5, id_user: 1, is_active: true };
    const conv = { id: 100 };

    mockFindByWebhookToken.mockResolvedValue(channel);
    mockFindChatbotById.mockResolvedValue(chatbot);
    mockGetOrCreateConversation.mockResolvedValue(conv);
    mockAddMessage.mockImplementation(async (convId, data) => ({
      id: data.role === 'visitor' ? (data.content.includes('Shop') ? 1 : 2) : 3,
      ...data,
    }));
    mockUpdateLastActivity.mockResolvedValue();
    mockFindActiveChannelById.mockResolvedValue(channel);
    mockGetLatestMessageId.mockResolvedValue(2);
    mockIsAiPaused.mockResolvedValue(false);
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
    mockRouteChatbotMessage.mockResolvedValue({ content: 'Dạ shop còn size M màu đen ạ!' });
    mockSendReply.mockResolvedValue({ success: true });

    // 1. Message 1 arrives
    mockParseWebhookEvent.mockReturnValueOnce({
      message: 'Shop ơi',
      senderId: 'user_123',
      messageId: 'oa_msg_1',
    });

    const res1 = { send: jest.fn() };
    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, res1);
    expect(res1.send).toHaveBeenCalledWith('ok');
    expect(mockAddMessage).toHaveBeenCalledWith(100, expect.objectContaining({
      role: 'visitor',
      content: 'Shop ơi',
      external_id: 'oa_msg_1',
    }));

    // Advance 4000ms
    jest.advanceTimersByTime(4000);

    // 2. Message 2 arrives at t=4000ms (resets quiet timer to t=10000ms)
    mockParseWebhookEvent.mockReturnValueOnce({
      message: 'Áo này còn size M không',
      senderId: 'user_123',
      messageId: 'oa_msg_2',
    });
    const res2 = { send: jest.fn() };
    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, res2);
    expect(res2.send).toHaveBeenCalledWith('ok');

    // Advance 6000ms more (t=10000ms since msg2) to trigger debounce flush
    await jest.advanceTimersByTimeAsync(6000);
    await Promise.resolve();

    // Should call rate limit exactly once
    expect(mockCheckBeforeAi).toHaveBeenCalledTimes(1);

    // Should call routeChatbotMessage with aggregated prompt and exclude current visitor rows.
    expect(mockRouteChatbotMessage).toHaveBeenCalledWith(expect.objectContaining({
      chatbotId: 5,
      conversationId: 100,
      throughMessageId: 2,
      excludeMessageIds: [1, 2],
      message: expect.stringContaining('Khách vừa gửi liên tiếp các tin sau:\n1. Shop ơi\n2. Áo này còn size M không'),
    }));

    // Should send 1 reply and save 1 bot message
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(mockSendReply).toHaveBeenCalledWith({
      conversationId: 100,
      message: 'Dạ shop còn size M màu đen ạ!',
      channelId: 10,
      externalId: 'user_123',
    });
    expect(mockAddMessage).toHaveBeenCalledWith(100, expect.objectContaining({
      role: 'bot',
      content: 'Dạ shop còn size M màu đen ạ!',
    }));
  });

  it('skips AI reply if handoff occurs during debounce waiting period', async () => {
    const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
    const chatbot = { id: 5, id_user: 1, is_active: true };
    const conv = { id: 100 };

    mockFindByWebhookToken.mockResolvedValue(channel);
    mockFindChatbotById.mockResolvedValue(chatbot);
    mockGetOrCreateConversation.mockResolvedValue(conv);
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockUpdateLastActivity.mockResolvedValue();
    mockFindActiveChannelById.mockResolvedValue(channel);
    mockGetLatestMessageId.mockResolvedValue(1);
    mockParseWebhookEvent.mockReturnValue({
      message: 'Alo',
      senderId: 'user_123',
      messageId: 'oa_msg_1',
    });
    mockRouteChatbotMessage.mockResolvedValue({ content: 'Hi' });
    mockSendReply.mockResolvedValue({ success: true });

    // Handoff paused at flush time
    mockIsAiPaused.mockResolvedValue(true);

    const res = { send: jest.fn() };
    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, res);

    await jest.advanceTimersByTimeAsync(6000);

    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('does not enqueue a duplicate visitor row returned by the database constraint', async () => {
    const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
    const chatbot = { id: 5, id_user: 1, is_active: true };
    const conv = { id: 100 };
    mockFindByWebhookToken.mockResolvedValue(channel);
    mockFindChatbotById.mockResolvedValue(chatbot);
    mockGetOrCreateConversation.mockResolvedValue(conv);
    mockAddMessage.mockResolvedValue({ id: 1, isDuplicate: true });

    await chatbotChannelWebhookController.handleZaloOA({
      params: { token: 'tok_1' },
      body: {},
    }, { send: jest.fn() });

    await jest.advanceTimersByTimeAsync(10000);
    expect(mockCheckBeforeAi).not.toHaveBeenCalled();
    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
  });

  it('does not call AI when the OA channel is disconnected during the debounce window', async () => {
    const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
    const chatbot = { id: 5, id_user: 1, is_active: true };
    const conv = { id: 100 };
    mockFindByWebhookToken.mockResolvedValue(channel);
    mockFindChatbotById.mockResolvedValue(chatbot);
    mockGetOrCreateConversation.mockResolvedValue(conv);
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockUpdateLastActivity.mockResolvedValue();
    mockParseWebhookEvent.mockReturnValue({ message: 'Alo', senderId: 'user_123', messageId: 'oa_msg_1' });
    mockFindActiveChannelById.mockResolvedValue(null);

    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, { send: jest.fn() });
    await jest.advanceTimersByTimeAsync(6000);

    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  // PLAN_VA_BAT_TAT_AI_2026-09-28 PR-A (mục 2): kiểm lại ngay TRƯỚC KHI GỬI, không chỉ trước khi
  // gọi AI (test "skips AI reply if handoff occurs during debounce waiting period" ở trên đã phủ
  // ca "đang tạm dừng SẴN TỪ ĐẦU" — ca này là "vừa bị tạm dừng NGAY TRONG LÚC routeChatbotMessage
  // đang chạy", isAiPaused false lần đầu rồi true lần kiểm lại).
  it('isAiPaused false rồi true (bị tạm dừng khi AI đang soạn) -> KHÔNG gửi, log result=paused_after_ai', async () => {
    const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
    const chatbot = { id: 5, id_user: 1, is_active: true };
    const conv = { id: 100 };

    mockFindByWebhookToken.mockResolvedValue(channel);
    mockFindChatbotById.mockResolvedValue(chatbot);
    mockGetOrCreateConversation.mockResolvedValue(conv);
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockUpdateLastActivity.mockResolvedValue();
    mockFindActiveChannelById.mockResolvedValue(channel);
    mockGetLatestMessageId.mockResolvedValue(1);
    mockParseWebhookEvent.mockReturnValue({ message: 'Alo', senderId: 'user_123', messageId: 'oa_msg_1' });
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
    mockRouteChatbotMessage.mockResolvedValue({ content: 'Hi' });
    mockSendReply.mockResolvedValue({ success: true });
    mockIsAiPaused.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const res = { send: jest.fn() };
    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, res);
    await jest.advanceTimersByTimeAsync(6000);

    expect(mockRouteChatbotMessage).toHaveBeenCalledTimes(1);
    expect(mockSendReply).not.toHaveBeenCalled();
    expect(mockIsAiPaused).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls.some(([line]) => line.includes('result=paused_after_ai'))).toBe(true);
    logSpy.mockRestore();
  });

  it('does not persist a bot row when sending the OA reply fails', async () => {
    const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
    const chatbot = { id: 5, id_user: 1, is_active: true };
    const conv = { id: 100 };
    mockFindByWebhookToken.mockResolvedValue(channel);
    mockFindChatbotById.mockResolvedValue(chatbot);
    mockGetOrCreateConversation.mockResolvedValue(conv);
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockUpdateLastActivity.mockResolvedValue();
    mockFindActiveChannelById.mockResolvedValue(channel);
    mockGetLatestMessageId.mockResolvedValue(1);
    mockIsAiPaused.mockResolvedValue(false);
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
    mockRouteChatbotMessage.mockResolvedValue({ content: 'Reply' });
    mockSendReply.mockResolvedValue({ success: false });
    mockParseWebhookEvent.mockReturnValue({ message: 'Alo', senderId: 'user_123', messageId: 'oa_msg_1' });

    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, { send: jest.fn() });
    await jest.advanceTimersByTimeAsync(6000);

    expect(mockAddMessage).toHaveBeenCalledTimes(1);
  });

  // G3b (A P1-6): câu xin lỗi (hết credit / AI lỗi) ghi vào chatbot_messages kèm NHÃN, không như câu AI trả lời thật.
  describe('G3b — câu xin lỗi do chatbot không trả lời được', () => {
    const arrange = (routeResult) => {
      const channel = { id: 10, id_chatbot: 5, channel_type: 'zalo_oa' };
      mockFindByWebhookToken.mockResolvedValue(channel);
      mockFindChatbotById.mockResolvedValue({ id: 5, id_user: 1, is_active: true });
      mockGetOrCreateConversation.mockResolvedValue({ id: 100 });
      mockAddMessage.mockResolvedValue({ id: 1 });
      mockUpdateLastActivity.mockResolvedValue();
      mockFindActiveChannelById.mockResolvedValue(channel);
      mockGetLatestMessageId.mockResolvedValue(1);
      mockIsAiPaused.mockResolvedValue(false);
      mockCheckBeforeAi.mockResolvedValue({ allowed: true });
      mockRouteChatbotMessage.mockResolvedValue(routeResult);
      mockSendReply.mockResolvedValue({ success: true });
      mockParseWebhookEvent.mockReturnValue({ message: 'Alo', senderId: 'user_123', messageId: 'oa_msg_1' });
    };
    const botRows = () => mockAddMessage.mock.calls.filter(([, row]) => row.role === 'bot').map(([, row]) => row);

    it('kết quả mang source ai_unavailable → dòng bot ghi metadata {source, reason}', async () => {
      arrange({ content: 'Xin lỗi, hiện chưa thể trả lời.', source: 'ai_unavailable', reason: 'credit_exhausted' });

      await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, { send: jest.fn() });
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(botRows()).toEqual([expect.objectContaining({
        content: 'Xin lỗi, hiện chưa thể trả lời.',
        metadata: { source: 'ai_unavailable', reason: 'credit_exhausted' },
      })]);
    });

    it('khách đã nhận câu xin lỗi trong 6 giờ (content null) → không gửi, không ghi dòng bot', async () => {
      arrange({ content: null, source: 'ai_unavailable', reason: 'credit_exhausted' });

      await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, { send: jest.fn() });
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockSendReply).not.toHaveBeenCalled();
      expect(botRows()).toHaveLength(0);
    });

    it('câu trả lời thật: metadata rỗng (không nhãn xin lỗi)', async () => {
      arrange({ content: 'Dạ còn hàng ạ' });

      await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, { send: jest.fn() });
      await jest.advanceTimersByTimeAsync(6000);

      expect(botRows()).toEqual([expect.objectContaining({ content: 'Dạ còn hàng ạ', metadata: {} })]);
    });
  });
});

describe('ChatbotChannelWebhookController - Facebook: AI tạm dừng kiểm trước khung giờ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-15T22:00:00+07:00'));
    inboundReplyDebounceService._resetForTests();
  });

  afterEach(() => {
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
  });

  // Từ 21/09/2026 kênh Facebook cũng gom tin qua inboundReplyDebounceService như Zalo OA: mọi cổng
  // (tạm dừng AI → khung giờ → rate limit) chạy trong `_processFacebookBatch` SAU khi hết nhịp gom.
  // Không tua đồng hồ thì batch không bao giờ chạy — test "không gửi gì" sẽ xanh vì chẳng có gì xảy ra.
  const flushDebounce = () => jest.advanceTimersByTimeAsync(10_000);

  function arrange({ paused }) {
    mockFindByWebhookToken.mockResolvedValue({ id: 20, id_chatbot: 8, channel_type: 'facebook' });
    mockFindActiveChannelById.mockResolvedValue({ id: 20, id_chatbot: 8 });
    mockFindChatbotById.mockResolvedValue({
      id: 8,
      id_user: 1,
      is_active: true,
      active_hours: { start: '08:00', end: '17:00', outsideAction: 'message', outsideMessage: 'Ngoài giờ' },
    });
    mockGetOrCreateConversation.mockResolvedValue({ id: 300 });
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockFbParseWebhookEvent.mockReturnValue([{ message: 'Alo', senderId: 'fb_user_1', messageId: 'fb_m1' }]);
    mockFbSendReply.mockResolvedValue({ success: true });
    mockIsAiPaused.mockResolvedValue(paused);
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
  }

  it('chủ shop đang tự trả lời (AI tạm dừng) + ngoài giờ → lưu tin khách, không gửi câu ngoài giờ, không ăn rate limit', async () => {
    arrange({ paused: true });
    const res = { send: jest.fn() };
    await chatbotChannelWebhookController.handleFacebook({ params: { token: 'fb_tok' }, body: {} }, res);
    await flushDebounce();

    expect(mockAddMessage).toHaveBeenCalledWith(300, expect.objectContaining({ role: 'visitor', content: 'Alo' }));
    // Batch ĐÃ chạy tới cổng tạm dừng (không phải "chưa chạy gì") rồi mới dừng ở đó.
    expect(mockIsAiPaused).toHaveBeenCalledWith(300, 'channel');
    expect(mockFbSendReply).not.toHaveBeenCalled();
    expect(mockCheckBeforeAi).not.toHaveBeenCalled();
    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
  });

  it('không tạm dừng + ngoài giờ → gửi câu ngoài giờ, không gọi AI', async () => {
    arrange({ paused: false });
    const res = { send: jest.fn() };
    await chatbotChannelWebhookController.handleFacebook({ params: { token: 'fb_tok' }, body: {} }, res);
    // Chưa hết nhịp gom thì chưa được trả lời gì.
    expect(mockFbSendReply).not.toHaveBeenCalled();
    await flushDebounce();

    expect(mockFbSendReply).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'fb_user_1', message: 'Ngoài giờ' }));
    // Ngoài giờ thì dừng TRƯỚC cổng rate limit và không gọi AI.
    expect(mockCheckBeforeAi).not.toHaveBeenCalled();
    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
  });
});

// PLAN_CONG_TAC_TRANG_THAI_CHATBOT PR-2: chatbot tắt công tắc trả lời (custom_chatbots.replies_enabled=false)
// → im lặng ở Zalo OA / Facebook / WhatsApp Cloud, tin khách VẪN được lưu, không gọi AI. Dùng
// chatbotActiveHours.service THẬT (chỉ kho khoá được mock) nên bỏ `repliesEnabled` ở nơi gọi là đỏ.
describe('ChatbotChannelWebhookController - replies_enabled=false', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-15T12:00:00+07:00'));
    inboundReplyDebounceService._resetForTests();
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockIsAiPaused.mockResolvedValue(false);
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
    mockRouteChatbotMessage.mockResolvedValue({ content: 'KHÔNG ĐƯỢC TRẢ LỜI' });
    mockSendReply.mockResolvedValue({ success: true });
    mockFbSendReply.mockResolvedValue({ success: true });
    mockWaSendReply.mockResolvedValue({ success: true });
    mockWaIsEnabledForChatbot.mockResolvedValue(true);
  });

  afterEach(() => {
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
  });

  const flushDebounce = () => jest.advanceTimersByTimeAsync(10_000);

  function expectNoAiNoReply(sendReply) {
    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
    expect(mockCheckBeforeAi).not.toHaveBeenCalled(); // không ăn hạn mức lượt trả lời
    expect(sendReply).not.toHaveBeenCalled();
    // Không có tin bot nào được ghi.
    expect(mockAddMessage.mock.calls.some(([, data]) => data.role === 'bot')).toBe(false);
  }

  it('Zalo OA: lưu tin khách, không gọi AI, không gửi', async () => {
    mockFindByWebhookToken.mockResolvedValue({ id: 10, id_chatbot: 5, channel_type: 'zalo_oa' });
    mockFindActiveChannelById.mockResolvedValue({ id: 10, id_chatbot: 5 });
    mockFindChatbotById.mockResolvedValue({ id: 5, id_user: 1, is_active: true, replies_enabled: false });
    mockGetOrCreateConversation.mockResolvedValue({ id: 100 });
    mockParseWebhookEvent.mockReturnValue({ message: 'Alo', senderId: 'user_off', messageId: 'oa_off_1' });

    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok' }, body: {} }, { send: jest.fn() });
    await flushDebounce();

    expect(mockAddMessage).toHaveBeenCalledWith(100, expect.objectContaining({ role: 'visitor', content: 'Alo' }));
    expectNoAiNoReply(mockSendReply);
  });

  it('Facebook: lưu tin khách, không gọi AI, không gửi (kể cả khi có câu ngoài giờ)', async () => {
    mockFindByWebhookToken.mockResolvedValue({ id: 20, id_chatbot: 8, channel_type: 'facebook' });
    mockFindActiveChannelById.mockResolvedValue({ id: 20, id_chatbot: 8 });
    mockFindChatbotById.mockResolvedValue({
      id: 8,
      id_user: 1,
      is_active: true,
      replies_enabled: false,
      active_hours: { start: '08:00', end: '11:00', outsideAction: 'message', outsideMessage: 'Ngoài giờ' },
    });
    mockGetOrCreateConversation.mockResolvedValue({ id: 300 });
    mockFbParseWebhookEvent.mockReturnValue([{ message: 'Alo', senderId: 'fb_off', messageId: 'fb_off_1' }]);

    await chatbotChannelWebhookController.handleFacebook({ params: { token: 'fb' }, body: {} }, { send: jest.fn() });
    await flushDebounce();

    expect(mockAddMessage).toHaveBeenCalledWith(300, expect.objectContaining({ role: 'visitor', content: 'Alo' }));
    expectNoAiNoReply(mockFbSendReply);
  });

  it('WhatsApp Cloud: batch không gọi AI, không gửi, không ghi tin bot', async () => {
    mockFindActiveChannelById.mockResolvedValue({ id: 30, id_chatbot: 9, channel_type: 'whatsapp' });
    mockFindChatbotById.mockResolvedValue({ id: 9, id_user: 1, is_active: true, replies_enabled: false });

    await chatbotChannelWebhookController._processWhatsAppBatch({
      channel: { id: 30, id_chatbot: 9 },
      chatbotId: 9,
      conv: { id: 400 },
      senderId: '8490000',
      batch: { messages: [{ content: 'Alo', persistedMessageId: 1 }], waitMs: 0, reason: 'test' },
    });

    // Batch ĐÃ chạy tới cổng (không phải dừng sớm ở khoá/tạm dừng).
    expect(mockIsAiPaused).toHaveBeenCalledWith(400, 'channel');
    expectNoAiNoReply(mockWaSendReply);
  });

  it('Đối chứng — replies_enabled thiếu/true thì Zalo OA vẫn gọi AI và trả lời', async () => {
    mockFindByWebhookToken.mockResolvedValue({ id: 10, id_chatbot: 5, channel_type: 'zalo_oa' });
    mockFindActiveChannelById.mockResolvedValue({ id: 10, id_chatbot: 5 });
    mockFindChatbotById.mockResolvedValue({ id: 5, id_user: 1, is_active: true });
    mockGetOrCreateConversation.mockResolvedValue({ id: 100 });
    mockGetLatestMessageId.mockResolvedValue(1);
    mockParseWebhookEvent.mockReturnValue({ message: 'Alo', senderId: 'user_on', messageId: 'oa_on_1' });

    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok' }, body: {} }, { send: jest.fn() });
    await flushDebounce();

    expect(mockRouteChatbotMessage).toHaveBeenCalledTimes(1);
    expect(mockSendReply).toHaveBeenCalledTimes(1);
  });
});

// G3b (A P1-6): câu xin lỗi (hết credit / AI lỗi) trên Facebook và WhatsApp Cloud cũng ghi vào chatbot_messages kèm NHÃN
// `source: 'ai_unavailable'` — thiếu nhãn là xin lỗi bị tính như câu trả lời thật của AI. (Zalo OA: describe "G3b" phía trên.)
describe('ChatbotChannelWebhookController - G3b: câu xin lỗi trên Facebook / WhatsApp Cloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-15T12:00:00+07:00'));
    inboundReplyDebounceService._resetForTests();
    mockAddMessage.mockResolvedValue({ id: 1 });
    mockIsAiPaused.mockResolvedValue(false);
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
    mockGetLatestMessageId.mockResolvedValue(1);
    mockFbSendReply.mockResolvedValue({ success: true });
    mockWaSendReply.mockResolvedValue({ success: true });
    mockWaIsEnabledForChatbot.mockResolvedValue(true);
  });

  afterEach(() => {
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
  });

  const flushDebounce = () => jest.advanceTimersByTimeAsync(10_000);
  const botRows = () => mockAddMessage.mock.calls.filter(([, row]) => row.role === 'bot').map(([, row]) => row);

  const arrangeFacebook = (routeResult) => {
    mockFindByWebhookToken.mockResolvedValue({ id: 20, id_chatbot: 8, channel_type: 'facebook' });
    mockFindActiveChannelById.mockResolvedValue({ id: 20, id_chatbot: 8 });
    mockFindChatbotById.mockResolvedValue({ id: 8, id_user: 1, is_active: true });
    mockGetOrCreateConversation.mockResolvedValue({ id: 300 });
    mockFbParseWebhookEvent.mockReturnValue([{ message: 'Alo', senderId: 'fb_user_1', messageId: 'fb_m1' }]);
    mockRouteChatbotMessage.mockResolvedValue(routeResult);
  };

  const runWhatsApp = () => chatbotChannelWebhookController._processWhatsAppBatch({
    channel: { id: 30, id_chatbot: 9 },
    chatbotId: 9,
    conv: { id: 400 },
    senderId: '8490000',
    batch: { messages: [{ content: 'Alo', persistedMessageId: 1 }], waitMs: 0, reason: 'test' },
  });

  it('Facebook: câu xin lỗi → gửi cho khách + dòng bot mang metadata {source, reason}', async () => {
    arrangeFacebook({ content: 'Xin lỗi, hiện chưa thể trả lời.', source: 'ai_unavailable', reason: 'credit_exhausted' });

    await chatbotChannelWebhookController.handleFacebook({ params: { token: 'fb' }, body: {} }, { send: jest.fn() });
    await flushDebounce();

    expect(mockFbSendReply).toHaveBeenCalledTimes(1);
    expect(botRows()).toEqual([expect.objectContaining({
      content: 'Xin lỗi, hiện chưa thể trả lời.',
      metadata: { source: 'ai_unavailable', reason: 'credit_exhausted' },
    })]);
  });

  it('Facebook: khách đã nhận câu xin lỗi trong 6 giờ (content null) → không gửi, không ghi dòng bot', async () => {
    arrangeFacebook({ content: null, source: 'ai_unavailable', reason: 'credit_exhausted' });

    await chatbotChannelWebhookController.handleFacebook({ params: { token: 'fb' }, body: {} }, { send: jest.fn() });
    await flushDebounce();

    expect(mockFbSendReply).not.toHaveBeenCalled();
    expect(botRows()).toHaveLength(0);
  });

  it('Facebook: câu trả lời thật → metadata rỗng', async () => {
    arrangeFacebook({ content: 'Dạ còn hàng ạ' });

    await chatbotChannelWebhookController.handleFacebook({ params: { token: 'fb' }, body: {} }, { send: jest.fn() });
    await flushDebounce();

    expect(botRows()).toEqual([expect.objectContaining({ content: 'Dạ còn hàng ạ', metadata: {} })]);
  });

  it('WhatsApp Cloud: câu xin lỗi → gửi cho khách + dòng bot mang metadata {source, reason}', async () => {
    mockFindActiveChannelById.mockResolvedValue({ id: 30, id_chatbot: 9, channel_type: 'whatsapp' });
    mockFindChatbotById.mockResolvedValue({ id: 9, id_user: 1, is_active: true });
    mockRouteChatbotMessage.mockResolvedValue({ content: 'Xin lỗi, hiện chưa thể trả lời.', source: 'ai_unavailable', reason: 'ai_error' });

    await runWhatsApp();

    expect(mockWaSendReply).toHaveBeenCalledTimes(1);
    expect(botRows()).toEqual([expect.objectContaining({
      content: 'Xin lỗi, hiện chưa thể trả lời.',
      metadata: { source: 'ai_unavailable', reason: 'ai_error' },
    })]);
  });

  it('WhatsApp Cloud: khách đã nhận câu xin lỗi trong 6 giờ (content null) → không gửi, không ghi dòng bot', async () => {
    mockFindActiveChannelById.mockResolvedValue({ id: 30, id_chatbot: 9, channel_type: 'whatsapp' });
    mockFindChatbotById.mockResolvedValue({ id: 9, id_user: 1, is_active: true });
    mockRouteChatbotMessage.mockResolvedValue({ content: null, source: 'ai_unavailable', reason: 'credit_exhausted' });

    await runWhatsApp();

    expect(mockWaSendReply).not.toHaveBeenCalled();
    expect(botRows()).toHaveLength(0);
  });
});
