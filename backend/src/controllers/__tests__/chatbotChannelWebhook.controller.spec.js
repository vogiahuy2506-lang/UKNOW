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
  });

  afterEach(() => {
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
  });

  it('responds ok immediately, saves visitor message, and aggregates burst into 1 AI reply', async () => {
    const channel = { id: 10, id_chatbot: 5 };
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

    // Advance 2s
    jest.advanceTimersByTime(2000);

    // 2. Message 2 arrives
    mockParseWebhookEvent.mockReturnValueOnce({
      message: 'Áo này còn size M không',
      senderId: 'user_123',
      messageId: 'oa_msg_2',
    });
    const res2 = { send: jest.fn() };
    await chatbotChannelWebhookController.handleZaloOA({ params: { token: 'tok_1' }, body: {} }, res2);
    expect(res2.send).toHaveBeenCalledWith('ok');

    // Advance 5s -> flush debounce
    await jest.advanceTimersByTimeAsync(5000);
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
    const channel = { id: 10, id_chatbot: 5 };
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

    await jest.advanceTimersByTimeAsync(4000);

    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('does not enqueue a duplicate visitor row returned by the database constraint', async () => {
    const channel = { id: 10, id_chatbot: 5 };
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
    const channel = { id: 10, id_chatbot: 5 };
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
    await jest.advanceTimersByTimeAsync(4000);

    expect(mockRouteChatbotMessage).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('does not persist a bot row when sending the OA reply fails', async () => {
    const channel = { id: 10, id_chatbot: 5 };
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
    await jest.advanceTimersByTimeAsync(4000);

    expect(mockAddMessage).toHaveBeenCalledTimes(1);
  });
});
