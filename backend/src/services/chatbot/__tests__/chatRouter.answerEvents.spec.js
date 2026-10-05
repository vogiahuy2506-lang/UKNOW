import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakeNoticeRepo, NOTICE_KIND_OWNER_EMAIL, NOTICE_KIND_VISITOR_APOLOGY } from './fakeAiUnavailableNoticeRepo.js';

/**
 * PR-10 mục 3(e) (A P2-10): sổ đo lường chatbot trả lời khách — mỗi lượt khách hỏi để lại MỘT sự kiện `chatbot_answer` (tầng app) với
 * chatbotId, channel, số đoạn RAG, độ giống, và outcome answered / no_info / fallback_text; tổng token ở meta.totalTokens (chi phí theo bot).
 * Chạy chatRouter THẬT + service ghi sự kiện THẬT; ranh giới giả lập: kho dữ liệu, RAG, Gemini (`_callAI`), credit, repository `ai_call_events`.
 */
const insertEvent = jest.fn(async () => {});
jest.unstable_mockModule('../../../repositories/ai/aiCallEvent.repository.js', () => ({ insertEvent, deleteOlderThanDays: jest.fn() }));

const buildContext = jest.fn();
const findChatbotById = jest.fn();
const getConversationHistory = jest.fn();
const getFormattedProfileForPrompt = jest.fn(async () => '');
const assertAvailable = jest.fn();
const consume = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/chatbot.repository.js', () => ({
  default: {
    getSettings: jest.fn(), getWebChatMessages: jest.fn(async () => []), addWebChatMessage: jest.fn(async () => ({})),
    getChannelMessages: jest.fn(async () => []), addChannelMessage: jest.fn(async () => ({})), findChatbotById, getConversationHistory,
  },
}));
jest.unstable_mockModule('../../../repositories/ai/unifiedInbox.repository.js', () => ({ default: { isAiPaused: jest.fn(async () => false) } }));
const noticeRepo = createFakeNoticeRepo();
jest.unstable_mockModule('../../../repositories/chatbot/aiUnavailableNotice.repository.js', () => ({
  default: noticeRepo, NOTICE_KIND_OWNER_EMAIL, NOTICE_KIND_VISITOR_APOLOGY,
}));
jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../ragEngine.service.js', () => ({ default: { buildContext } }));
jest.unstable_mockModule('../subAssistant.service.js', () => ({ default: { getById: jest.fn() } }));
jest.unstable_mockModule('../channelAdapters/webChat.adapter.js', () => ({ default: { sendReply: jest.fn() } }));
jest.unstable_mockModule('../channelAdapters/zaloOA.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../channelAdapters/facebook.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../channelAdapters/zaloPersonal.adapter.js', () => ({ default: {} }));
jest.unstable_mockModule('../whatsappBaileys.service.js', () => ({
  default: {}, listSessions: jest.fn(() => []), listPersistedSessions: jest.fn(async () => []), sendMessage: jest.fn(async () => ({})),
}));
jest.unstable_mockModule('../../../repositories/chatbot/chatbotContactAlert.repository.js', () => ({ default: { getOwnerContact: jest.fn() } }));
jest.unstable_mockModule('../../ai/businessProfile.service.js', () => ({ default: { getFormattedProfileForPrompt } }));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (text) => text }));
jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { isLimitError: () => false, reserve: jest.fn(), record: jest.fn(), resolveFallbackModel: jest.fn() },
}));
jest.unstable_mockModule('../../ai/aiCreditMeter.service.js', () => ({
  default: { assertAvailable, charge: jest.fn(), consume, isLimitError: () => false },
  VISITOR_CHAT_UNAVAILABLE_MESSAGE: 'unavailable',
  VISITOR_CHAT_ERROR_MESSAGE: 'Xin lỗi, hiện chưa thể trả lời. Vui lòng thử lại sau.',
}));
jest.unstable_mockModule('../../ai/aiModelPolicy.service.js', () => ({ resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash') }));

const { default: chatRouterService } = await import('../chatRouter.service.js');

const SETTINGS = { is_enabled: true, id_sub_assistant: null, ai_model: 'gemini-2.5-flash', temperature: 0.7, max_tokens: 512 };
const events = () => insertEvent.mock.calls.map(([row]) => row);
const flush = () => new Promise((resolve) => { setImmediate(resolve); });

describe('chatbot trả lời khách → sự kiện chatbot_answer (A P2-10)', () => {
  const originalFlag = process.env.AI_CALL_EVENTS_ENABLED;
  let callAI;

  beforeEach(() => {
    process.env.AI_CALL_EVENTS_ENABLED = 'true';
    insertEvent.mockClear();
    buildContext.mockReset().mockImplementation(async (_u, _q, options) => {
      options.onStats?.({ kbChunks: 3, profileChunks: 1, topSimilarity: 0.8234 });
      return 'ngữ cảnh';
    });
    findChatbotById.mockReset().mockResolvedValue({ id: 9, id_user: 3, name: 'Bot', welcome_message: 'Chao', system_instruction: '' });
    getConversationHistory.mockReset().mockResolvedValue([]);
    getFormattedProfileForPrompt.mockReset().mockResolvedValue('');
    assertAvailable.mockReset().mockResolvedValue({ skip: false });
    consume.mockReset().mockResolvedValue(undefined);
    // Lịch sử hội thoại của kênh Zalo/Telegram cá nhân đọc THẲNG CSDL (repository zaloPersonal/telegram — spec này không giả chúng). Không chặn ở đây thì
    // ca nào đi qua `routeMessageWithSettings` với kênh đó sẽ chờ kết nối CSDL thật: máy có Postgres chạy thì lỗi nhanh, máy/CI không có thì treo tới hết
    // 5 giây của jest (5 ca treo đúng 5000 ms khi chạy riêng, chỉ lộ khi CSDL không với tới được). Lịch sử không phải thứ spec này kiểm.
    jest.spyOn(chatRouterService, '_getHistory').mockResolvedValue([]);
    callAI = jest.spyOn(chatRouterService, '_callAI').mockResolvedValue({ text: 'Khoá Python giá 2.9tr nhé', usage: { totalTokens: 1234 }, modelUsed: 'gemini-x' });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFlag === undefined) delete process.env.AI_CALL_EVENTS_ENABLED;
    else process.env.AI_CALL_EVENTS_ENABLED = originalFlag;
  });

  const runChannel = (channel = 'zalo_personal') => chatRouterService.routeMessageWithSettings({
    channel, userId: 7, message: 'giá khoá Python?', conversationId: 99, chatbotSettings: SETTINGS, chatbotId: 21,
  });

  describe('kênh Zalo/Telegram/WhatsApp… (routeMessageWithSettings)', () => {
    it('AI trả lời → MỘT sự kiện answered: chatbotId, channel, ragChunks (kb + hồ sơ), ragKbChunks, topSimilarity làm tròn, totalTokens, model thật', async () => {
      await runChannel();
      await flush();

      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({
        layer: 'app', feature: 'chatbot_answer', outcome: 'ok', errorCode: null, ownerUserId: 7, model: 'gemini-x',
        meta: { chatbotId: 21, channel: 'zalo_personal', outcome: 'answered', ragChunks: 4, ragKbChunks: 3, topSimilarity: 0.82, totalTokens: 1234 },
      });
      expect(events()[0].meta.replyChars).toBe('Khoá Python giá 2.9tr nhé'.length);
    });

    it('AI trả câu "Mình chưa có thông tin…" (đúng câu khung prompt dặn) → outcome no_info; RAG rỗng → ragChunks 0', async () => {
      buildContext.mockImplementation(async (_u, _q, options) => {
        options.onStats?.({ kbChunks: 0, profileChunks: 0, topSimilarity: null });
        return '';
      });
      callAI.mockResolvedValue({ text: 'Mình chưa có thông tin về học phí trong hệ thống, bạn liên hệ hotline nhé', usage: { totalTokens: 10 } });

      await runChannel('telegram_personal');
      await flush();

      expect(events()[0]).toMatchObject({ outcome: 'ok', meta: { outcome: 'no_info', ragChunks: 0, ragKbChunks: 0, channel: 'telegram_personal' } });
      expect(events()[0].meta.topSimilarity).toBeUndefined();
    });

    it('AI lỗi (khách nhận câu xin lỗi soạn sẵn) → outcome fallback_text, tầng event = error + mã lỗi; KHÔNG có totalTokens', async () => {
      callAI.mockRejectedValue(Object.assign(new Error('chậm'), { code: 'AI_TIMEOUT', status: 503 }));

      await runChannel();
      await flush();

      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({
        feature: 'chatbot_answer', outcome: 'error', errorCode: 'AI_TIMEOUT', meta: { chatbotId: 21, channel: 'zalo_personal', outcome: 'fallback_text', ragChunks: 4 },
      });
      expect(events()[0].meta.totalTokens).toBeUndefined();
    });

    it('hết credit (trước khi gọi AI) → fallback_text với lý do, không có ragChunks (chưa tra RAG)', async () => {
      jest.spyOn(chatRouterService, '_prepareChatCredit').mockResolvedValue({ visitorMessage: 'unavailable', unavailableReason: 'credit_exhausted' });
      await runChannel();
      await flush();
      expect(callAI).not.toHaveBeenCalled();
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({ outcome: 'error', errorCode: 'credit_exhausted', meta: { chatbotId: 21, outcome: 'fallback_text' } });
      expect(events()[0].meta.ragChunks).toBeUndefined();
    });

    it('KHÔNG ghi câu hỏi / câu trả lời vào sự kiện', async () => {
      await runChannel();
      await flush();
      const dumped = JSON.stringify(events());
      expect(dumped).not.toContain('Python');
      expect(dumped).not.toContain('giá khoá');
    });

    it('sổ bền hỏng (repository ném) → khách VẪN nhận câu trả lời', async () => {
      insertEvent.mockRejectedValueOnce(new Error('DB sập'));
      const result = await runChannel();
      expect(result).toEqual({ type: 'text', content: 'Khoá Python giá 2.9tr nhé' });
    });
  });

  describe('Studio / Zalo OA / Facebook / WhatsApp Cloud (routeChatbotMessage)', () => {
    const runStudio = () => chatRouterService.routeChatbotMessage({ chatbotId: 9, message: 'giá khoá Python?', conversationId: 1 });

    it('trả lời → answered, channel studio_channel, chatbotId = id bot', async () => {
      jest.spyOn(chatRouterService, '_prepareChatCredit').mockResolvedValue({ creditContext: {} });
      jest.spyOn(chatRouterService, '_chargeChatCredit').mockResolvedValue(undefined);
      const result = await runStudio();
      await flush();
      expect(result).toEqual({ content: 'Khoá Python giá 2.9tr nhé' });
      expect(events()).toEqual([expect.objectContaining({
        feature: 'chatbot_answer', outcome: 'ok', ownerUserId: 3,
        meta: expect.objectContaining({ chatbotId: 9, channel: 'studio_channel', outcome: 'answered', ragChunks: 4, totalTokens: 1234 }),
      })]);
    });

    it('AI lỗi → fallback_text + mã lỗi; không tìm thấy chatbot (chưa biết chủ) → KHÔNG ghi', async () => {
      jest.spyOn(chatRouterService, '_prepareChatCredit').mockResolvedValue({ creditContext: {} });
      callAI.mockRejectedValue(Object.assign(new Error('bận'), { code: 'AI_PROVIDER_BUSY', status: 503 }));
      await runStudio();
      await flush();
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({ outcome: 'error', errorCode: 'AI_PROVIDER_BUSY', meta: { chatbotId: 9, outcome: 'fallback_text' } });

      insertEvent.mockClear();
      findChatbotById.mockResolvedValue(null);
      await runStudio();
      await flush();
      expect(events()).toEqual([]);
    });
  });
});
