import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  extractGeminiUsage,
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
});
