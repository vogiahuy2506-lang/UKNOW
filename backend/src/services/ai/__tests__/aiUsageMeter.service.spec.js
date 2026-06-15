import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const getResourceUsage = jest.fn();
const trackUsage = jest.fn();
const countGeminiTokens = jest.fn();
const generateGeminiContent = jest.fn();

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({
  default: {
    getResourceUsage,
    trackUsage,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  countGeminiTokens,
  generateGeminiContent,
}));

const { default: aiUsageMeter } = await import('../aiUsageMeter.service.js');

describe('aiUsageMeter.service', () => {
  beforeEach(() => {
    getResourceUsage.mockReset();
    trackUsage.mockReset();
    countGeminiTokens.mockReset();
    generateGeminiContent.mockReset();
  });

  it('clamps max output tokens to the remaining budget after input tokens', async () => {
    getResourceUsage.mockResolvedValue({ used: 800, limit: 1500 });
    countGeminiTokens.mockResolvedValue(200);

    const result = await aiUsageMeter.reserve(10, {
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      requestedMaxOutputTokens: 2048,
    });

    expect(result.maxOutputTokens).toBe(500);
  });

  it('throws before generation when input tokens consume the remaining budget', async () => {
    getResourceUsage.mockResolvedValue({ used: 900, limit: 1000 });
    countGeminiTokens.mockResolvedValue(100);

    await expect(aiUsageMeter.reserve(10, {
      contents: [{ role: 'user', parts: [{ text: 'large prompt' }] }],
      requestedMaxOutputTokens: 2048,
    })).rejects.toMatchObject({
      status: 403,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      resource: 'ai_token',
    });
  });

  it('records actual total tokens and metadata without re-checking quota', async () => {
    await aiUsageMeter.record(10, { promptTokens: 120, outputTokens: 201, totalTokens: 321 }, {
      feature: 'custom_chat',
      model: 'gemini-test',
    });

    expect(trackUsage).toHaveBeenCalledWith(10, 'ai_token', 321, {
      feature: 'custom_chat',
      model: 'gemini-test',
      promptTokens: 120,
      outputTokens: 201,
      totalTokens: 321,
    });
    expect(getResourceUsage).not.toHaveBeenCalled();
  });
});
