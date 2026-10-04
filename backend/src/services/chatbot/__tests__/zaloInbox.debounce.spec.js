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
const mockFindChatbotById = jest.fn();

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
    // Chốt khung giờ (0acc4ad9) đọc active_hours của chatbot gắn với hội thoại.
    findChatbotById: mockFindChatbotById,
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
    mockFindChatbotById.mockResolvedValue({ id: 10, active_hours: null });
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

  // G3b (A P1-6): câu xin lỗi (hết credit / AI lỗi) KHÔNG được ghi nhãn 'ai_auto_reply' — bản tin tuần đếm theo nhãn đó.
  describe('G3b — câu xin lỗi do chatbot không trả lời được', () => {
    const sendOneMessage = async (msgId = 'apology_1') => {
      const handler = zaloInboxService.createMessageHandler(1, 10, 10);
      await handler(
        { msgId, fromUid: 'visitor_99', content: 'Alo shop', type: 0 },
        { conversationId: 200, messageId: 601 }
      );
      await jest.advanceTimersByTimeAsync(6000);
    };

    it('kết quả mang source ai_unavailable → sendReply ghi nhãn ai_unavailable + lý do, KHÔNG phải ai_auto_reply', async () => {
      mockRouteMessageWithSettings.mockResolvedValue({
        type: 'text', content: 'Xin lỗi, hiện chưa thể trả lời tin nhắn của bạn.', source: 'ai_unavailable', reason: 'credit_exhausted',
      });

      await sendOneMessage();

      expect(mockSendReply).toHaveBeenCalledTimes(1);
      const arg = mockSendReply.mock.calls[0][0];
      expect(arg.replySource).toBe('ai_unavailable');
      expect(arg.metadata).toEqual({ source: 'ai_unavailable', reason: 'credit_exhausted' });
      expect(arg.message).toBe('Xin lỗi, hiện chưa thể trả lời tin nhắn của bạn.');
    });

    it('khách đã nhận câu xin lỗi trong 6 giờ (content null) → KHÔNG gửi gì, KHÔNG phát SSE trả lời', async () => {
      mockRouteMessageWithSettings.mockResolvedValue({ type: 'suppressed', content: null, source: 'ai_unavailable', reason: 'credit_exhausted' });

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      await sendOneMessage('apology_2');

      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
      expect(mockSendReply).not.toHaveBeenCalled();
      expect(mockBroadcast).toHaveBeenCalledTimes(1); // chỉ SSE tin khách vào
      // Log nói ĐÚNG lý do không gửi (không phải "failed" — vận hành sẽ đi tìm lỗi gửi Zalo không có thật).
      expect(logSpy.mock.calls.some(([line]) => String(line).includes('result=apology_suppressed'))).toBe(true);
      expect(logSpy.mock.calls.some(([line]) => String(line).includes('result=failed'))).toBe(false);
      logSpy.mockRestore();
    });

    it('câu trả lời thật (không source) vẫn mang nhãn ai_auto_reply và KHÔNG có metadata tự chế', async () => {
      await sendOneMessage('real_reply_1');

      const arg = mockSendReply.mock.calls[0][0];
      expect(arg.replySource).toBe('ai_auto_reply');
      expect(arg).not.toHaveProperty('metadata');
    });
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

  // PLAN_SUA_AI_DOT4 PR-7 (A P2-1): chatbot bị khoá vì hạ gói/hết slot — 4 kênh khác đã chặn, Zalo cá nhân chỉ kiểm
  // `zalo_accounts` nên bot vẫn gọi Gemini + trừ credit. Mock KHOÁ THEO KEY: tài khoản Zalo không khoá, chỉ `chatbots`.
  describe('A P2-1 — khoá tài nguyên chatbots chặn Zalo cá nhân', () => {
    const lockOnly = (...lockedKeys) => mockResourceIsLocked.mockImplementation(async (key) => lockedKeys.includes(key));

    it('chatbot ghim bị khoá (tài khoản Zalo không khoá) → KHÔNG rate limit, KHÔNG gọi AI, KHÔNG trả lời, log result=locked', async () => {
      lockOnly('chatbots');
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 420, id_chatbot: 10 });
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'lockbot_1', fromUid: 'visitor_lock', content: 'Shop ơi còn hàng không', type: 0 },
        { conversationId: 420, messageId: 910 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockResourceIsLocked).toHaveBeenCalledWith('zalo_accounts', 5);
      expect(mockResourceIsLocked).toHaveBeenCalledWith('chatbots', 10);
      expect(mockCheckBeforeAi).not.toHaveBeenCalled();
      expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
      expect(mockSendReply).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.some(([line]) => String(line).includes('chatbot=10') && String(line).includes('result=locked'))).toBe(true);
      logSpy.mockRestore();
    });

    it('đối chứng: chatbot KHÔNG khoá (chỉ khoá chatbot khác) → vẫn gọi AI như cũ', async () => {
      mockResourceIsLocked.mockImplementation(async (key, id) => key === 'chatbots' && id === 99);
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 421, id_chatbot: 10 });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'lockbot_2', fromUid: 'visitor_ok', content: 'Shop ơi', type: 0 },
        { conversationId: 421, messageId: 911 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockResourceIsLocked).toHaveBeenCalledWith('chatbots', 10);
      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
      expect(mockSendReply).toHaveBeenCalledTimes(1);
    });

    it('hội thoại KHÔNG ghim chatbot nào → không tra khoá chatbots (hành vi cũ, không chặn nhầm)', async () => {
      lockOnly('chatbots');
      mockPickEnabledChatbotForZalo.mockResolvedValue(null);
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 422, id_chatbot: null });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'lockbot_3', fromUid: 'visitor_nopin2', content: 'Alo', type: 0 },
        { conversationId: 422, messageId: 912 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockResourceIsLocked.mock.calls.some(([key]) => key === 'chatbots')).toBe(false);
      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
    });
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

  // PLAN_VA_BAT_TAT_AI_2026-09-28 PR-A (mục 2): chủ nhảy vào tạm dừng AI ngay TRONG LÚC Gemini
  // đang soạn (isAiPaused false lúc kiểm ở bước 3, nhưng true khi kiểm lại ngay trước sendReply).
  describe('PR-A (mục 2) — kiểm lại tạm dừng ngay trước khi gửi', () => {
    it('isAiPaused false rồi true (đang soạn thì bị tạm dừng) -> KHÔNG gửi, log result=paused_after_ai', async () => {
      mockIsAiPaused
        .mockResolvedValueOnce(false) // bước 3: kiểm trước khi gọi AI
        .mockResolvedValueOnce(true); // kiểm lại ngay trước khi gửi

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const handler = zaloInboxService.createMessageHandler(1, 10, 10);

      await handler(
        { msgId: 'paused_1', fromUid: 'visitor_99', content: 'Alo', type: 0 },
        { conversationId: 200, messageId: 601 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
      expect(mockSendReply).not.toHaveBeenCalled();
      expect(mockIsAiPaused).toHaveBeenCalledTimes(2);
      expect(logSpy.mock.calls.some(([line]) => line.includes('result=paused_after_ai'))).toBe(true);
      logSpy.mockRestore();
    });

    it('isAiPaused false cả hai lần -> gửi như cũ', async () => {
      mockIsAiPaused.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
      const handler = zaloInboxService.createMessageHandler(1, 10, 10);

      await handler(
        { msgId: 'notpaused_1', fromUid: 'visitor_99', content: 'Alo', type: 0 },
        { conversationId: 200, messageId: 602 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(mockIsAiPaused).toHaveBeenCalledTimes(2);
    });
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

    it('chatbot ngoài khung giờ (im lặng) → không gọi AI, không chạy rate limit, không trả lời', async () => {
      jest.setSystemTime(new Date('2026-09-15T22:00:00+07:00'));
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 402, id_chatbot: 10 });
      mockFindChatbotById.mockResolvedValue({
        id: 10,
        active_hours: { start: '08:00', end: '17:00', outsideAction: 'silent' },
      });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'ah_1', fromUid: 'visitor_night', content: 'Shop còn mở không', type: 0 },
        { conversationId: 402, messageId: 903 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockFindChatbotById).toHaveBeenCalledWith(10);
      expect(mockCheckBeforeAi).not.toHaveBeenCalled();
      expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
      expect(mockSendReply).not.toHaveBeenCalled();
    });

    it('chatbot tắt công tắc trả lời (replies_enabled=false) → không gọi AI, không chạy rate limit, không trả lời', async () => {
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 403, id_chatbot: 10 });
      mockFindChatbotById.mockResolvedValue({ id: 10, active_hours: null, replies_enabled: false });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 're_1', fromUid: 'visitor_off', content: 'Shop ơi', type: 0 },
        { conversationId: 403, messageId: 904 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      // Batch ĐÃ chạy tới cổng (đọc chatbot) rồi mới dừng ở đó.
      expect(mockFindChatbotById).toHaveBeenCalledWith(10);
      expect(mockCheckBeforeAi).not.toHaveBeenCalled();
      expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
      expect(mockSendReply).not.toHaveBeenCalled();
    });

    it('chatbot replies_enabled=true → vẫn gọi AI như cũ', async () => {
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 404, id_chatbot: 10 });
      mockFindChatbotById.mockResolvedValue({ id: 10, active_hours: null, replies_enabled: true });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 're_2', fromUid: 'visitor_on', content: 'Shop ơi', type: 0 },
        { conversationId: 404, messageId: 905 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
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
  // PLAN_SUA_AI_DOT1_2026-10-03 F1.5 (A P1-4): chủ xoá chatbot A (còn chatbot B) → dòng Zalo của A từng vẫn bật,
  // hội thoại đã ghim A vẫn được AI trả lời + trừ credit bằng cấu hình dự phòng của kênh.
  describe('F1.5 — chatbot đã xoá mềm không còn trả lời Zalo cá nhân', () => {
    it('hội thoại ghim chatbot A mà findChatbotById trả null (xoá mềm) → KHÔNG rate limit, KHÔNG gọi AI, KHÔNG trả lời, log result=disabled', async () => {
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 410, id_chatbot: 10 });
      // Dòng Zalo của A còn is_enabled = true (trạng thái cũ trước bản sửa deleteCustomChatbot).
      mockGetAccountSettings.mockResolvedValue({ is_enabled: true, chatbot_enabled: true });
      mockFindChatbotById.mockResolvedValue(null);
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'del_1', fromUid: 'visitor_del', content: 'Shop ơi còn hàng không', type: 0 },
        { conversationId: 410, messageId: 906 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      // Batch ĐÃ chạy tới cổng đọc chatbot rồi mới dừng ở đó.
      expect(mockFindChatbotById).toHaveBeenCalledWith(10);
      expect(mockCheckBeforeAi).not.toHaveBeenCalled();
      expect(mockRouteMessageWithSettings).not.toHaveBeenCalled();
      expect(mockSendReply).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.some(([line]) => String(line).includes('result=disabled (chatbot đã xoá)'))).toBe(true);
      logSpy.mockRestore();
    });

    it('đối chứng: cùng hội thoại, chatbot còn sống → vẫn gọi AI như cũ', async () => {
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 411, id_chatbot: 10 });
      mockGetAccountSettings.mockResolvedValue({ is_enabled: true, chatbot_enabled: true });
      mockFindChatbotById.mockResolvedValue({ id: 10, active_hours: null });

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'del_2', fromUid: 'visitor_alive', content: 'Shop ơi', type: 0 },
        { conversationId: 411, messageId: 907 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
    });

    it('hội thoại KHÔNG ghim chatbot nào (id_chatbot null, chọn được chatbot khác) không bị cổng mới chặn nhầm', async () => {
      mockPickEnabledChatbotForZalo.mockResolvedValue(null);
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: 412, id_chatbot: null });
      mockGetAccountSettings.mockResolvedValue({ is_enabled: true, chatbot_enabled: true });
      mockFindChatbotById.mockResolvedValue(null);

      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: 'del_3', fromUid: 'visitor_nopin', content: 'Alo', type: 0 },
        { conversationId: 412, messageId: 908 }
      );
      await jest.advanceTimersByTimeAsync(6000);

      // Không có idChatbot → không đọc chatbot, hành vi cũ (account bật thì vẫn đi tiếp).
      expect(mockFindChatbotById).not.toHaveBeenCalled();
      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
    });
  });

  // PR-B (29/09): cấu hình AI lấy từ chatbot ĐƯỢC GÁN; dòng chatbot_settings kênh chỉ dự phòng;
  // cột AI của chatbot_zalo_account_settings (DEFAULT bảng) không được đè.
  describe('PR-B — cấu hình AI theo chatbot được gán', () => {
    async function runOnce(convId, chatbotId) {
      jest.spyOn(zaloInboxService, 'getOrCreateConversation').mockResolvedValue({ id: convId, id_chatbot: chatbotId });
      const handler = zaloInboxService.createMessageHandler(1, 5, 5);
      await handler(
        { msgId: `prb_${convId}`, fromUid: 'visitor_prb', content: 'Alo', type: 0 },
        { conversationId: convId, messageId: convId + 1000 }
      );
      await jest.advanceTimersByTimeAsync(6000);
      expect(mockRouteMessageWithSettings).toHaveBeenCalledTimes(1);
      return mockRouteMessageWithSettings.mock.calls[0][0].chatbotSettings;
    }

    it('chatbot gán thắng DEFAULT czs và dòng kênh (temperature/max_tokens/style/welcome)', async () => {
      mockPickEnabledChatbotForZalo.mockResolvedValue(10);
      mockGetChatbotSettings.mockResolvedValue({
        is_enabled: true, temperature: 0.3, max_tokens: 512, response_style: 'formal', welcome_message: 'kenh', ai_model: 'kenh-model',
      });
      mockGetAccountSettings.mockResolvedValue({
        is_enabled: true, chatbot_enabled: true,
        temperature: 0.7, max_tokens: 2048, response_style: 'friendly', welcome_message: null, ai_model: 'czs-model',
        chatbot_temperature: 1.0, chatbot_max_tokens: 1024, chatbot_response_style: 'concise',
        chatbot_welcome_message: 'X', chatbot_ai_model: 'bot-model',
      });
      const merged = await runOnce(700, 10);
      expect(merged.temperature).toBe(1.0);
      expect(merged.max_tokens).toBe(1024);
      expect(merged.response_style).toBe('concise');
      expect(merged.welcome_message).toBe('X');
      expect(merged.ai_model).toBe('bot-model');
      expect(merged.is_enabled).toBe(true);
    });

    it('chatbot gán để trống instruction → dùng instruction dòng kênh (dự phòng)', async () => {
      mockPickEnabledChatbotForZalo.mockResolvedValue(10);
      mockGetChatbotSettings.mockResolvedValue({ is_enabled: true, system_instruction: 'HUONG DAN KENH', temperature: 0.4 });
      mockGetAccountSettings.mockResolvedValue({
        is_enabled: true, chatbot_enabled: true, temperature: 0.7,
        chatbot_system_instruction: '   ', chatbot_temperature: null,
      });
      const merged = await runOnce(701, 10);
      expect(merged.system_instruction).toBe('HUONG DAN KENH');
      // chatbot không đặt temperature → dự phòng dòng kênh, KHÔNG phải DEFAULT czs 0.7
      expect(merged.temperature).toBe(0.4);
    });

    it('dòng kênh = hướng dẫn A, kênh gán chatbot B → dùng hướng dẫn B', async () => {
      mockPickEnabledChatbotForZalo.mockResolvedValue(20);
      mockGetChatbotSettings.mockResolvedValue({ is_enabled: true, system_instruction: 'HUONG DAN A' });
      mockGetAccountSettings.mockResolvedValue({
        is_enabled: true, chatbot_enabled: true, chatbot_system_instruction: 'HUONG DAN B',
      });
      const merged = await runOnce(702, 20);
      expect(merged.system_instruction).toBe('HUONG DAN B');
    });
  });
});
