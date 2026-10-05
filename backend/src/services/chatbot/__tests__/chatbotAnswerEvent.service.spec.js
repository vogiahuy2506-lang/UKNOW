import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildChatbotSystemPrompt } from '../../../utils/chatbotSystemPrompt.util.js';

/**
 * PR-10 mục 3(e): ghim hai thứ của sổ đo lường chatbot mà spec chatRouter không bắt được:
 *  1. biểu thức nhận "chưa có thông tin" PHẢI khớp câu mà khung prompt dặn bot nói (đổi câu dặn mà quên đổi biểu thức → `no_info` âm thầm về 0);
 *  2. hình dạng sự kiện theo từng outcome, không ghi nội dung, không bao giờ ném.
 */
const insertEvent = jest.fn(async () => {});
jest.unstable_mockModule('../../../repositories/ai/aiCallEvent.repository.js', () => ({ insertEvent, deleteOlderThanDays: jest.fn() }));

const {
  NO_INFO_REPLY_RE, classifyChatbotReply, recordChatbotAnswerEvent, CHATBOT_ANSWER_OUTCOME,
} = await import('../chatbotAnswerEvent.service.js');

describe('NO_INFO_REPLY_RE ↔ khung prompt chatbot', () => {
  it('câu "chưa có thông tin" mà khung prompt dặn bot nói được biểu thức nhận ra', () => {
    const prompt = buildChatbotSystemPrompt({
      subAssistant: null, settings: {}, chatbot: { name: 'Bot' }, ragContext: '', profileContext: '', isFirstMessage: false, contactNote: null,
    });
    const instructed = prompt.match(/"(Mình chưa có thông tin về \[X\][^"]*)"/);
    expect(instructed).not.toBeNull(); // câu dặn còn nằm trong prompt (nếu bị đổi chữ, ca này đỏ và nhắc cập nhật NO_INFO_REPLY_RE)
    const sample = instructed[1].replace('[X]', 'học phí').replace('[kênh hỗ trợ]', 'hotline');
    expect(NO_INFO_REPLY_RE.test(sample)).toBe(true);
    expect(classifyChatbotReply(sample)).toBe('no_info');
  });

  it('câu trả lời thường → answered; rỗng/không phải chuỗi → answered (không ném)', () => {
    expect(classifyChatbotReply('Khoá Python giá 2.9tr nhé')).toBe('answered');
    expect(classifyChatbotReply('')).toBe('answered');
    expect(classifyChatbotReply(null)).toBe('answered');
    expect(classifyChatbotReply('MÌNH CHƯA CÓ THÔNG TIN về cái đó')).toBe('no_info');
  });
});

describe('recordChatbotAnswerEvent', () => {
  const originalFlag = process.env.AI_CALL_EVENTS_ENABLED;
  const flush = () => new Promise((resolve) => { setImmediate(resolve); });

  beforeEach(() => {
    process.env.AI_CALL_EVENTS_ENABLED = 'true';
    insertEvent.mockClear();
  });
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.AI_CALL_EVENTS_ENABLED;
    else process.env.AI_CALL_EVENTS_ENABLED = originalFlag;
  });

  it('thiếu ragStats → không có ragChunks/topSimilarity (không đo được ≠ 0)', async () => {
    recordChatbotAnswerEvent({ ownerUserId: 3, channel: 'web', chatbotId: 5, reply: 'ok', usage: { totalTokens: 9 } });
    await flush();
    const { meta } = insertEvent.mock.calls[0][0];
    expect(meta).toMatchObject({ chatbotId: 5, channel: 'web', outcome: 'answered', totalTokens: 9 });
    expect(meta.ragChunks).toBeUndefined();
    expect(meta.topSimilarity).toBeUndefined();
  });

  it('ragStats null-field (topSimilarity null) KHÔNG thành 0; 0 thật (đo được, không có đoạn) vẫn là 0', async () => {
    recordChatbotAnswerEvent({ channel: 'web', reply: 'x', ragStats: { kbChunks: 0, profileChunks: 0, topSimilarity: null } });
    await flush();
    const { meta } = insertEvent.mock.calls[0][0];
    expect(meta).toMatchObject({ ragChunks: 0, ragKbChunks: 0 });
    expect(meta.topSimilarity).toBeUndefined();
  });

  it('lỗi → outcome fallback_text, event error, mã theo lỗi; lý do thay cho lỗi khi hết credit', async () => {
    recordChatbotAnswerEvent({ channel: 'web', chatbotId: 1, failure: Object.assign(new Error('x'), { code: 'AI_TIMEOUT' }) });
    recordChatbotAnswerEvent({ channel: 'web', chatbotId: 1, failureReason: 'credit_exhausted' });
    await flush();
    expect(insertEvent.mock.calls[0][0]).toMatchObject({ outcome: 'error', errorCode: 'AI_TIMEOUT', meta: { outcome: 'fallback_text' } });
    expect(insertEvent.mock.calls[1][0]).toMatchObject({ outcome: 'error', errorCode: 'credit_exhausted', meta: { outcome: 'fallback_text' } });
    expect(CHATBOT_ANSWER_OUTCOME.FALLBACK_TEXT).toBe('fallback_text');
  });

  it('đầu vào lạ (không tham số, ragStats là chuỗi) → không ném', () => {
    expect(() => recordChatbotAnswerEvent()).not.toThrow();
    expect(() => recordChatbotAnswerEvent({ channel: 'web', ragStats: 'rác', usage: 5 })).not.toThrow();
  });
});
