import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';

const mockFindConversation = jest.fn();
const mockIsAiPaused = jest.fn();
const mockGetLatestMessageId = jest.fn();
const mockGetChatbotSettings = jest.fn();
const mockGetAccountSettings = jest.fn();
const mockPickEnabledChatbotForZalo = jest.fn();
const mockRouteMessageWithSettings = jest.fn();
const mockSendReply = jest.fn();
const mockBroadcast = jest.fn();
const mockCheckBeforeAi = jest.fn();
const mockMarkRateLimitNotified = jest.fn();
const mockGetSessionByAccountId = jest.fn();
const mockResourceIsLocked = jest.fn();

jest.unstable_mockModule('../../../repositories/chatbot/zaloPersonal.repository.js', () => ({
  default: {
    findConversation: mockFindConversation,
    isAiPaused: mockIsAiPaused,
    getLatestMessageId: mockGetLatestMessageId,
  },
}));

jest.unstable_mockModule('../../../repositories/chatbot/zaloInbox.repository.js', () => ({
  default: {
    findConversation: mockFindConversation,
    maybeResetSession: jest.fn().mockResolvedValue(false),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    getSettings: mockGetChatbotSettings,
  },
}));

jest.unstable_mockModule('../../../repositories/chatbot/chatbotZaloAccount.repository.js', () => ({
  default: {
    getSettings: mockGetAccountSettings,
    pickEnabledChatbotForZalo: mockPickEnabledChatbotForZalo,
  },
}));

jest.unstable_mockModule('../chatRouter.service.js', () => ({
  default: {
    routeMessageWithSettings: mockRouteMessageWithSettings,
  },
}));

jest.unstable_mockModule('../channelAdapters/zaloPersonal.adapter.js', () => ({
  default: {
    sendReply: mockSendReply,
    getSessionByAccountId: mockGetSessionByAccountId,
    removeMessageHandler: jest.fn(),
  },
}));

jest.unstable_mockModule('../../sse.service.js', () => ({
  default: {
    broadcast: mockBroadcast,
  },
}));

jest.unstable_mockModule('../chatbotRateLimit.service.js', () => ({
  default: {
    checkBeforeAi: mockCheckBeforeAi,
    markRateLimitNotified: mockMarkRateLimitNotified,
  },
}));

jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: mockResourceIsLocked,
}));

const { default: zaloInboxService } = await import('../zaloInbox.service.js');
const { default: inboundReplyDebounceService } = await import('../inboundReplyDebounce.service.js');

describe('zaloInbox.service - Debounced Auto Reply', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    inboundReplyDebounceService._resetForTests();
    jest.clearAllMocks();
    // Pin debounce config so the 6s/10s timing model is deterministic regardless of host env.
    process.env.CHATBOT_INBOUND_DEBOUNCE_MS = '6000';
    process.env.CHATBOT_INBOUND_MAX_WAIT_MS = '10000';

        mockFindConversation.mockResolvedValue({ id: 200, visitor_info: {} });
    mockIsAiPaused.mockResolvedValue(false);
    mockGetLatestMessageId.mockResolvedValue(502);
    mockGetChatbotSettings.mockResolvedValue({ is_enabled: true });
    mockGetAccountSettings.mockResolvedValue({ is_enabled: true, chatbot_enabled: true });
    mockPickEnabledChatbotForZalo.mockResolvedValue(null);
    mockCheckBeforeAi.mockResolvedValue({ allowed: true });
    mockRouteMessageWithSettings.mockResolvedValue({ content: 'Chào bạn, áo này còn size M ạ!' });
    mockSendReply.mockResolvedValue({ success: true });
    mockGetSessionByAccountId.mockResolvedValue({ api: {} });
    mockResourceIsLocked.mockResolvedValue(false);
    jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 200 });
  });

  afterEach(() => {
    inboundReplyDebounceService._resetForTests();
    jest.useRealTimers();
    delete process.env.CHATBOT_INBOUND_DEBOUNCE_MS;
    delete process.env.CHATBOT_INBOUND_MAX_WAIT_MS;
  });

  it('aggregates burst of personal 1-1 messages into 1 AI response with history exclusion', async () => {
    const handler = zaloInboxService.createMessageHandler(1, 10, 10);

    // Message 1 arrives
    await handler(
      { msgId: 'zmsg_1', fromUid: 'visitor_99', content: 'Shop ơi', type: 0 },
      { conversationId: 200, messageId: 501 }
    );

    // Advance 3000ms
    jest.advanceTimersByTime(3000);

    // Message 2 arrives at t=3000ms (resets quiet timer to t=9000ms)
    await handler(
      { msgId: 'zmsg_2', fromUid: 'visitor_99', content: 'Có size M không', type: 0 },
      { conversationId: 200, messageId: 502 }
    );

    // Advance 6000ms more (t=9000ms since msg2) to trigger debounce flush
    await jest.advanceTimersByTimeAsync(6000);

    // Should call rate limit once
    expect(mockCheckBeforeAi).toHaveBeenCalledTimes(1);

    // Should call routeMessageWithSettings once with batched prompt and exclude current visitor rows.
    expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
    expect(mockRouteMessageWithSettings).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'zalo_personal',
      userId: 1,
      conversationId: 200,
      throughMessageId: 502,
      excludeMessageIds: [501, 502],
      message: expect.stringContaining('Khách vừa gửi liên tiếp các tin sau:\n1. Shop ơi\n2. Có size M không'),
    }));

    // Should send 1 reply and 1 SSE broadcast
    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(mockSendReply).toHaveBeenCalledWith({
      externalId: 'visitor_99',
      message: 'Chào bạn, áo này còn size M ạ!',
      userId: 1,
      accountId: 10,
      persist: true,
      replySource: 'ai_auto_reply',
    });

    expect(mockBroadcast).toHaveBeenCalledWith('1', 'inbox:new_message', expect.objectContaining({
      conversationId: 200,
      channel: 'zalo_personal',
      message: 'Chào bạn, áo này còn size M ạ!',
      role: 'agent',
    }));
  });

  it('skips AI routing for group messages without enqueuing into debounce', async () => {
    const handler = zaloInboxService.createMessageHandler(1, 10, 10);

    // Group message (type=1)
    await handler(
      { msgId: 'gmsg_1', fromUid: 'visitor_99', clientGroupId: 'g_123', content: 'Chào nhóm', type: 1 },
      { conversationId: 300, messageId: 601 }
    );

    await jest.advanceTimersByTimeAsync(10000);

    expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
  });

  it('does not consume rate/AI or broadcast a reply when the account is resource locked', async () => {
    mockResourceIsLocked.mockResolvedValue(true);
    const handler = zaloInboxService.createMessageHandler(1, 10, 10);

    await handler(
      { msgId: 'locked_1', fromUid: 'visitor_99', content: 'Alo', type: 0 },
      { conversationId: 200, messageId: 601 }
    );
    await jest.advanceTimersByTimeAsync(6000);

    expect(mockCheckBeforeAi).not.toHaveBeenCalled();
    expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
    expect(mockSendReply).not.toHaveBeenCalled();
    expect(mockBroadcast).toHaveBeenCalledTimes(1); // inbound visitor SSE only
  });

    it('does not broadcast a phantom agent message when Zalo send fails', async () => {
    mockSendReply.mockResolvedValue({ success: false, error: 'No active session' });
    const handler = zaloInboxService.createMessageHandler(1, 10, 10);

    await handler(
      { msgId: 'send_fail_1', fromUid: 'visitor_99', content: 'Alo', type: 0 },
      { conversationId: 200, messageId: 601 }
    );
    await jest.advanceTimersByTimeAsync(6000);

    expect(mockSendReply).toHaveBeenCalledTimes(1);
    expect(mockBroadcast).toHaveBeenCalledTimes(1); // inbound visitor SSE only
  });

  // Bug 1 regression: when multiple chatbots share the same Zalo account,
  // toggling chatbot A's enable flag must NOT bleed into chatbot B's
  // settings row. The fix uses (user, zalo, chatbot) as a composite key —
  // getSettings is now scoped by idChatbot and pickEnabledChatbotForZalo
  // spreads conversations across enabled chatbots deterministically.
  describe('Bug 1 — multi-chatbot Zalo isolation', () => {
    it('routes a chat-pinned conversation to its own chatbot and scopes settings to that chatbot', async () => {
      // Two chatbots, A=10 and B=20, both enabled for the same Zalo account 5.
      mockPickEnabledChatbotForZalo.mockResolvedValue(10);
      // Conversation already pinned to chatbot A.
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({
        id: 400,
        id_chatbot: 10,
      });
      // Chatbot A enabled, chatbot B disabled. If scope is correct, only
      // the row for chatbot A is read and the test passes through.
      mockGetAccountSettings.mockImplementation(async (uid, zsid, opts) => {
        if (opts?.idChatbot === 10) return { is_enabled: true };
        return { is_enabled: false };
      });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);

      await handler(
        { msgId: 'b1_a', fromUid: 'visitor_a', content: 'Alo A', type: 0 },
        { conversationId: 400, messageId: 901 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      // Settings should be looked up scoped to chatbot 10
      expect(mockGetAccountSettings).toHaveBeenCalledWith(
        1,
        5,
        expect.objectContaining({ idChatbot: 10 })
      );
      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
      expect(mockRouteMessageWithSettings.mock.calls[0][0].chatbotId).toBe(10);
    });

    it('does not enable sibling chatbot B when only A is on (settings row is scoped per chatbot)', async () => {
      // Conversation pinned to A; both chatbots exist in the join table but
      // only A is enabled. Reading settings scoped to A should still return
      // { is_enabled: true } while a sibling read for B would return false.
      mockPickEnabledChatbotForZalo.mockResolvedValue(20);
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({
        id: 401,
        id_chatbot: 20,
      });
      mockGetAccountSettings.mockImplementation(async (uid, zsid, opts) => {
        if (opts?.idChatbot === 20) return { is_enabled: true };
        return { is_enabled: false };
      });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'b1_b', fromUid: 'visitor_b', content: 'Alo B', type: 0 },
        { conversationId: 401, messageId: 902 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockGetAccountSettings).toHaveBeenCalledWith(
        1,
        5,
        expect.objectContaining({ idChatbot: 20 })
      );
      expect(mockRouteMessageWithSettings.mock.calls[0][0].chatbotId).toBe(20);
    });

    it('skips AI when no chatbot is pinned and no enabled chatbot can be picked', async () => {
      mockPickEnabledChatbotForZalo.mockResolvedValue(null);
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({
        id: 402,
        id_chatbot: null,
      });
      // accountSettings stays null → isZaloAccountChatbotEnabled() === false
      mockGetAccountSettings.mockResolvedValue(null);

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'b1_none', fromUid: 'visitor_x', content: 'Alo', type: 0 },
        { conversationId: 402, messageId: 903 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
      expect(mockSendReply).not.toHaveBeenCalled();
    });
  });
});
