import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const originalFetch = global.fetch;
const originalApiKey = process.env.GEMINI_API_KEY;
const resolveAllowedModel = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: {} }));
jest.unstable_mockModule('../../../utils/fileExtractor.util.js', () => ({ extractTextFromBuffer: jest.fn() }));
jest.unstable_mockModule('../../../utils/aiResponseFormatter.util.js', () => ({ stripMarkdown: (t) => t }));
jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  extractGeminiUsage: () => ({}),
  // Dùng regex thật để test đúng wiring (fallback kích theo message lỗi Gemini).
  isThinkingBudgetRejection: (err) => /budget 0 is invalid|thinking mode|thinking_?budget/i.test(String(err?.message || '')),
  joinGeminiTextParts: (parts) => (Array.isArray(parts)
    ? parts.filter((p) => p?.text && !p.thought).map((p) => p.text).join('')
    : ''),
}));
jest.unstable_mockModule('../aiUsageMeter.service.js', () => ({ default: {} }));
jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: (...args) => resolveAllowedModel(...args),
}));
jest.unstable_mockModule('../../chatbot/chatAttachment.service.js', () => ({ default: {} }));

const { default: customChatService } = await import('../customChat.service.js');

describe('customChat.callGeminiWithRetry thinking config', () => {
  beforeEach(() => {
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('gửi thinkingConfig budget 0 và lọc thought parts', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'nghĩ thầm', thought: true }, { text: 'Chào bạn' }] } }],
      }),
    });
    global.fetch = fetchMock;

    const res = await customChatService.callGeminiWithRetry('hi', { maxTokens: 2048, userId: 1 });

    expect(res.text).toBe('Chào bạn');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('budget-0 → fallback trong doFetch (1 lần), KHÔNG đốt slot retry mạng', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Budget 0 is invalid. This model only works in thinking mode.' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'cứu' }] } }] }),
      });
    global.fetch = fetchMock;

    const res = await customChatService.callGeminiWithRetry('hi', { maxTokens: 512, userId: 1 });

    // budget-0 KHÔNG thuộc retryableErrors mạng → thành công chứng minh fallback nằm TRONG
    // doFetch (nếu ở vòng retry mạng thì lỗi 400 bị ném thẳng, không retry).
    expect(res.text).toBe('cứu');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(first.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(second.generationConfig.thinkingConfig).toBeUndefined();
    expect(second.generationConfig.maxOutputTokens).toBe(3072); // Math.max(min(512,65536), 3072)
  });
});

describe('customChat.chat — phong cách trả lời (responseStyle)', () => {
  const runChat = async (extra = {}) => {
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');
    const svc = customChatService;
    const searchSpy = jest.spyOn(svc, 'searchChunks').mockResolvedValue([]);
    const callSpy = jest.spyOn(svc, 'callGeminiWithRetry').mockResolvedValue({ text: 'ok', usage: {} });
    const meter = (await import('../aiUsageMeter.service.js')).default;
    meter.reserve = jest.fn().mockResolvedValue({ maxOutputTokens: 100 });
    meter.record = jest.fn().mockResolvedValue(undefined);
    const chatAttachment = (await import('../../chatbot/chatAttachment.service.js')).default;
    chatAttachment.buildAiPartsFromHistory = jest.fn().mockResolvedValue([]);
    await svc.chat({
      history: [{ role: 'user', content: 'xin chao' }],
      chatbotId: 1,
      userId: 2,
      systemInstruction: 'Ban la tro ly cua shop.',
      temperature: 0.7,
      maxTokens: 100,
      ...extra,
    });
    const text = callSpy.mock.calls[0][0][0].text;
    searchSpy.mockRestore();
    callSpy.mockRestore();
    return text;
  };

  it("responseStyle 'professional' -> prompt chứa câu phong cách chuyên nghiệp", async () => {
    const text = await runChat({ responseStyle: 'professional' });
    expect(text).toContain('## PHONG CACH TRA LOI\nChuyen nghiep, ngan gon, suc tich.');
    expect(text).toContain('Ban la tro ly cua shop.');
  });

  it("responseStyle 'casual' -> prompt chứa câu phong cách thoải mái", async () => {
    const text = await runChat({ responseStyle: 'casual' });
    expect(text).toContain('Than thien nhung thoai mai, co the dung tieng long nhe.');
  });

  it('không truyền responseStyle -> prompt giữ nguyên như cũ (không thêm mục phong cách)', async () => {
    const text = await runChat();
    expect(text).not.toContain('PHONG CACH TRA LOI');
  });
});
