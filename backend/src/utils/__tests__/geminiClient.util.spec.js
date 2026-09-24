import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AI_PROVIDER_BUSY_CODE,
  AI_PROVIDER_BUSY_MESSAGE,
  extractGeminiUsage,
  GEMINI_TRANSIENT_STATUSES,
  generateGeminiContent,
  isThinkingBudgetRejection,
  joinGeminiTextParts,
  THINKING_BUDGET_RETRY_RE,
} from '../geminiClient.util.js';

describe('geminiClient.util', () => {
  describe('extractGeminiUsage', () => {
    it('maps Gemini usageMetadata to normalized token counts', () => {
      expect(extractGeminiUsage({
        usageMetadata: {
          promptTokenCount: 123,
          candidatesTokenCount: 45,
          totalTokenCount: 168,
        },
      })).toEqual({
        promptTokens: 123,
        outputTokens: 45,
        totalTokens: 168,
      });
    });

    it('falls back to prompt + output tokens when totalTokenCount is missing', () => {
      expect(extractGeminiUsage({
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 20,
        },
      })).toEqual({
        promptTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
      });
    });
  });

  describe('joinGeminiTextParts / isThinkingBudgetRejection', () => {
    it('skips thought parts', () => {
      expect(joinGeminiTextParts([
        { text: 'secret', thought: true },
        { text: 'hello' },
        { text: ' world' },
      ])).toBe('hello world');
    });

    it('detects thinking-budget rejection messages', () => {
      expect(isThinkingBudgetRejection(new Error('Budget 0 is invalid. This model only works in thinking mode.'))).toBe(true);
      expect(THINKING_BUDGET_RETRY_RE.test('thinking_budget is not supported')).toBe(true);
      expect(isThinkingBudgetRejection(new Error('Thiếu GEMINI_API_KEY'))).toBe(false);
    });
  });

  describe('generateGeminiContent thinkingBudget', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;

    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
      global.fetch = jest.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    function mockOk(text = 'ok') {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
        }),
      });
    }

    it('defaults to thinkingBudget 0 in generationConfig', async () => {
      mockOk();
      await generateGeminiContent({ parts: [{ text: 'hi' }], maxOutputTokens: 100 });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(body.generationConfig.maxOutputTokens).toBe(100);
    });

    it('sends custom positive thinkingBudget', async () => {
      mockOk();
      await generateGeminiContent({ parts: [{ text: 'hi' }], thinkingBudget: 512 });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 512 });
    });

    it.each([null, -1])('omits thinkingConfig when thinkingBudget is %p', async (budget) => {
      mockOk();
      await generateGeminiContent({ parts: [{ text: 'hi' }], thinkingBudget: budget });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.generationConfig.thinkingConfig).toBeUndefined();
    });

    it('retries without thinkingConfig when model rejects budget 0', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Budget 0 is invalid. This model only works in thinking mode.',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'rescued' }] } }],
            usageMetadata: {},
          }),
        });

      const result = await generateGeminiContent({
        parts: [{ text: 'hi' }],
        maxOutputTokens: 1024,
        thinkingBudget: 0,
      });

      expect(result.text).toBe('rescued');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const first = JSON.parse(global.fetch.mock.calls[0][1].body);
      const second = JSON.parse(global.fetch.mock.calls[1][1].body);
      expect(first.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(second.generationConfig.thinkingConfig).toBeUndefined();
      expect(second.generationConfig.maxOutputTokens).toBe(3072);
    });
  });

  /**
   * Sự cố 24/09/2026: Google trả 503 "high demand … usually temporary" sau 1,4 giây, lớp này không
   * thử lại lần nào, và khách thấy nguyên cục JSON tiếng Anh trong khung chat sinh landing.
   */
  describe('generateGeminiContent — Google quá tải', () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.GEMINI_API_KEY;
    // Nghỉ 0ms giữa các lượt để bài chạy tức thì; ngân sách rộng để không cản.
    const NHANH = { retryDelaysMs: [0, 0], retryBudgetMs: 60_000 };
    const THAN_503 = '{ "error": { "code": 503, "message": "This model is currently experiencing high demand.", "status": "UNAVAILABLE" } }';

    const loi = (status, text = THAN_503) => ({ ok: false, status, statusText: 'x', text: async () => text });
    const duoc = (text = 'ok') => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }),
    });

    let warn;
    beforeEach(() => {
      process.env.GEMINI_API_KEY = 'test-key';
      global.fetch = jest.fn();
      warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      global.fetch = originalFetch;
      warn.mockRestore();
      if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = originalKey;
    });

    it('503 một lần rồi được → khách nhận kết quả, không thấy lỗi nào', async () => {
      global.fetch.mockResolvedValueOnce(loi(503)).mockResolvedValueOnce(duoc('cứu được'));

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH });

      expect(kq.text).toBe('cứu được');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it.each(GEMINI_TRANSIENT_STATUSES)('mã %i được coi là tạm thời → có thử lại', async (status) => {
      global.fetch.mockResolvedValueOnce(loi(status)).mockResolvedValueOnce(duoc());

      await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('quá tải cả 3 lượt → câu tiếng Việt, mã AI_PROVIDER_BUSY, KHÔNG còn JSON của Google', async () => {
      global.fetch.mockResolvedValue(loi(503));

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(err.message).toBe(AI_PROVIDER_BUSY_MESSAGE);
      expect(err.message).not.toMatch(/[{}]|UNAVAILABLE|high demand/);
      expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
      expect(err.status).toBe(503);
      expect(err.attempts).toBe(3);
      // Câu gốc vẫn còn cho log máy chủ.
      expect(err.providerMessage).toContain('high demand');
    });

    it('400 → KHÔNG thử lại (gọi lại y hệt chỉ nhận y hệt lỗi), câu gốc giữ nguyên', async () => {
      global.fetch.mockResolvedValue(loi(400, 'Request payload size exceeds the limit'));

      const err = await generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.geminiStatus).toBe(400);
      expect(err.code).toBeUndefined();
      // isThinkingBudgetRejection ở 3 service help/* soi đúng câu gốc — đổi câu là gãy nhánh đó.
      expect(err.message).toContain('Request payload size exceeds the limit');
    });

    it('lỗi đến CHẬM (quá ngân sách) → thôi thử lại, trả lỗi ngay', async () => {
      // Lượt sinh landing có thể chạy 1–2 phút; hỏng ở giây 60 mà còn thử lại thì chỉ đổi lỗi này
      // lấy lỗi hết giờ 100 giây của Cloudflare. Ngân sách 0 = mọi lỗi đều "đến chậm".
      global.fetch.mockResolvedValue(loi(503));

      const err = await generateGeminiContent({
        parts: [{ text: 'hi' }], retryDelaysMs: [0, 0], retryBudgetMs: 0,
      }).catch((e) => e);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(err.code).toBe(AI_PROVIDER_BUSY_CODE);
    });

    it('hết giờ chờ (AbortError) → KHÔNG thử lại', async () => {
      const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
      global.fetch.mockRejectedValue(abort);

      await expect(generateGeminiContent({ parts: [{ text: 'hi' }], ...NHANH })).rejects.toBe(abort);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('model từ chối thinkingBudget rồi quá tải → lượt thử lại KHÔNG gửi lại thinkingBudget', async () => {
      global.fetch
        .mockResolvedValueOnce(loi(400, 'Budget 0 is invalid. This model only works in thinking mode.'))
        .mockResolvedValueOnce(loi(503))
        .mockResolvedValueOnce(duoc('xong'));

      const kq = await generateGeminiContent({ parts: [{ text: 'hi' }], thinkingBudget: 0, ...NHANH });

      expect(kq.text).toBe('xong');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      const lanBa = JSON.parse(global.fetch.mock.calls[2][1].body);
      expect(lanBa.generationConfig.thinkingConfig).toBeUndefined();
    });
  });
});
