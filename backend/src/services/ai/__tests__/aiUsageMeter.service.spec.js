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

jest.unstable_mockModule('../aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn(async (_userId, model) => model || 'gemini-2.0-flash'),
}));

const { resolveAllowedModel } = await import('../aiModelPolicy.service.js');
const { default: aiUsageMeter } = await import('../aiUsageMeter.service.js');

describe('aiUsageMeter.service', () => {
  beforeEach(() => {
    getResourceUsage.mockReset();
    trackUsage.mockReset();
    countGeminiTokens.mockReset();
    generateGeminiContent.mockReset();
    resolveAllowedModel.mockReset();
    resolveAllowedModel.mockImplementation(async (_userId, model) => model || 'gemini-2.0-flash');
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

  it('reserve trả model đã clamp khi gói không giới hạn token (limit <= 0)', async () => {
    getResourceUsage.mockResolvedValue({ used: 0, limit: 0 });
    resolveAllowedModel.mockResolvedValue('gemini-2.0-flash');

    const result = await aiUsageMeter.reserve(10, {
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      model: 'gemini-2.5-pro',
    });

    expect(result.model).toBe('gemini-2.0-flash');
    expect(countGeminiTokens).not.toHaveBeenCalled();
  });

  it('generateWithBudget vẫn dùng model đã clamp khi limit <= 0', async () => {
    getResourceUsage.mockResolvedValue({ used: 0, limit: null });
    resolveAllowedModel.mockResolvedValue('gemini-2.0-flash');
    generateGeminiContent.mockResolvedValue({
      text: 'ok',
      usage: { promptTokens: 1, outputTokens: 2, totalTokens: 3 },
    });

    await aiUsageMeter.generateWithBudget(10, {
      parts: [{ text: 'hi' }],
      model: 'gemini-2.5-pro',
      feature: 'test',
    });

    expect(generateGeminiContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.0-flash' })
    );
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
