import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const trackUsage = jest.fn();
const generateGeminiContent = jest.fn();

jest.unstable_mockModule('../../payment/usageTracking.service.js', () => ({
  default: {
    trackUsage,
  },
}));

jest.unstable_mockModule('../../../utils/geminiClient.util.js', () => ({
  generateGeminiContent,
}));

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.5-flash'),
}));

const { resolveAllowedModel } = await import('../aiModelPolicy.service.js');
const { default: aiUsageMeter } = await import('../aiUsageMeter.service.js');

describe('aiUsageMeter.service', () => {
  beforeEach(() => {
    trackUsage.mockReset();
    generateGeminiContent.mockReset();
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockImplementation(async (_userId, model) => model || 'gemini-2.5-flash');
  });

  it('reserve no longer blocks on token quota — returns model and output cap only', async () => {
    resolveAllowedModel.mockResolvedValue('gemini-2.5-flash');

    const result = await aiUsageMeter.reserve(10, {
      model: 'gemini-2.5-pro',
      requestedMaxOutputTokens: 2048,
    });

    expect(result.model).toBe('gemini-2.5-flash');
    expect(result.maxOutputTokens).toBe(2048);
    expect(result.remaining).toBeNull();
  });

  it('generateWithBudget still records token usage for admin analytics', async () => {
    generateGeminiContent.mockResolvedValue({
      text: 'ok',
      usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 },
    });

    await aiUsageMeter.generateWithBudget(10, {
      parts: [{ text: 'hi' }],
      feature: 'test',
    });

    expect(trackUsage).toHaveBeenCalledWith(10, 'ai_token', 3, expect.objectContaining({
      feature: 'test',
      totalTokens: 3,
    }));
  });

  it('isLimitError recognizes ai_credit resource', () => {
    expect(aiUsageMeter.isLimitError({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      resource: 'ai_credit',
    })).toBe(true);
  });
});
