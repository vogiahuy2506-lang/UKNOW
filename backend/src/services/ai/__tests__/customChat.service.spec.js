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
