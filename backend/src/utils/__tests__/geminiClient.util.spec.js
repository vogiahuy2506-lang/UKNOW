import { describe, expect, it } from '@jest/globals';
import { extractGeminiUsage } from '../geminiClient.util.js';

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
});
