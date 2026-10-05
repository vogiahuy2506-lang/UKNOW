import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 3(e) (A P2-10): đường WEB (widget nhúng, trang /chat, "Chat thử" Studio — `customChat.chat`) cũng để lại MỘT sự kiện `chatbot_answer` mỗi lượt khách
 * hỏi: chatbotId, channel web, số đoạn RAG, outcome answered / no_info / fallback_text, tổng token. Lõi Gemini THẬT chạy, chỉ `fetch` (Google) và repository
 * `ai_call_events` được giả; service ghi sự kiện chạy thật.
 */
const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
const originalFlag = process.env.AI_CALL_EVENTS_ENABLED;

const insertEvent = jest.fn(async () => {});
jest.unstable_mockModule('../../../repositories/ai/aiCallEvent.repository.js', () => ({ insertEvent, deleteOlderThanDays: jest.fn() }));
jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../businessProfile.service.js', () => ({ default: { getFormattedProfileForPrompt: jest.fn(async () => '') } }));
jest.unstable_mockModule('../../../utils/fileExtractor.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (t) => t }));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({
  default: { reserve: jest.fn(async () => ({ maxOutputTokens: 100 })), record: jest.fn(async () => undefined), resolveFallbackModel: jest.fn(async () => null) },
}));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({ resolveAllowedModel: jest.fn(async () => 'gemini-2.5-flash') }));
jest.unstable_mockModule('../../chatbot/chatAttachment.service.js', () => ({ default: { buildAiPartsFromHistory: jest.fn(async () => []) } }));

const { default: customChatService } = await import('../customChat.service.js');

const googleReply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });
const googleOk = (text) => googleReply(200, {
  candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8, totalTokenCount: 58 },
});
const chatEvents = () => insertEvent.mock.calls.map(([row]) => row).filter((row) => row.feature === 'chatbot_answer');
const flush = () => new Promise((resolve) => { setImmediate(resolve); });
const ask = () => customChatService.chat({
  history: [{ role: 'user', content: 'Khoá AI giá bao nhiêu?' }], chatbotId: 17, userId: 4, temperature: 0.7, maxTokens: 100,
});

describe('customChat.chat → sự kiện chatbot_answer (đường web)', () => {
  beforeEach(() => {
    process.env.AI_CALL_EVENTS_ENABLED = 'true';
    process.env.GEMINI_API_KEY = 'AIza-test';
    insertEvent.mockClear();
    jest.spyOn(customChatService, 'searchChunks').mockResolvedValue(['Giờ mở cửa 8h-21h', 'Bảo hành 12 tháng']);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalApiKey;
    if (originalFlag === undefined) delete process.env.AI_CALL_EVENTS_ENABLED; else process.env.AI_CALL_EVENTS_ENABLED = originalFlag;
  });

  it('AI trả lời → answered, channel web, chatbotId, ragChunks = số đoạn đưa vào prompt, totalTokens', async () => {
    global.fetch = jest.fn().mockResolvedValue(googleOk('Dạ 500k ạ'));
    const result = await ask();
    await flush();
    expect(result.content).toBe('Dạ 500k ạ');
    expect(chatEvents()).toEqual([expect.objectContaining({
      layer: 'app', outcome: 'ok', ownerUserId: 4,
      meta: expect.objectContaining({ chatbotId: 17, channel: 'web', outcome: 'answered', ragChunks: 2, ragKbChunks: 2, totalTokens: 58 }),
    })]);
    expect(chatEvents()[0].meta.topSimilarity).toBeUndefined(); // đường này chỉ có chữ đoạn, không có độ giống
  });

  it('AI nói "chưa có thông tin" → no_info; tra RAG không ra đoạn nào → ragChunks 0', async () => {
    customChatService.searchChunks.mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue(googleOk('Mình chưa có thông tin về học phí trong hệ thống nhé'));
    await ask();
    await flush();
    expect(chatEvents()[0].meta).toMatchObject({ outcome: 'no_info', ragChunks: 0 });
  });

  it('Google lỗi → ném lỗi như cũ + MỘT sự kiện fallback_text mang mã lỗi', async () => {
    global.fetch = jest.fn().mockResolvedValue(googleReply(400, { error: { code: 400, message: 'bad request' } }));
    await expect(ask()).rejects.toBeTruthy();
    await flush();
    expect(chatEvents()).toHaveLength(1);
    expect(chatEvents()[0]).toMatchObject({ outcome: 'error', errorCode: 'GEMINI_400', meta: { chatbotId: 17, channel: 'web', outcome: 'fallback_text', ragChunks: 2 } });
  });

  it('không ghi câu hỏi / câu trả lời vào sự kiện', async () => {
    global.fetch = jest.fn().mockResolvedValue(googleOk('Dạ 500k ạ'));
    await ask();
    await flush();
    expect(JSON.stringify(insertEvent.mock.calls)).not.toMatch(/Khoá AI|500k/);
  });
});
