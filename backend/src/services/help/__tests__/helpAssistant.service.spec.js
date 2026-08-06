import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerate = jest.fn();
const mockRecord = jest.fn();

jest.unstable_mockModule('../geminiText.util.js', () => ({
  generateGeminiText: mockGenerate,
}));

jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { record: mockRecord, reserve: jest.fn() },
}));

jest.unstable_mockModule('../helpCenter.service.js', () => ({
  getCapabilityMapText: jest.fn(async () => ''),
  searchHelpChunks: jest.fn(async () => ({ chunks: [], topSimilarity: 0 })),
}));

jest.unstable_mockModule('../../../repositories/help/helpArticle.repository.js', () => ({
  insertUnanswered: jest.fn(async () => {}),
}));

const { routeQuestion } = await import('../helpAssistant.service.js');

describe('helpAssistant.service routeQuestion', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
  });

  it('đường thường: tắt thinking, cap 256, một lần gọi', async () => {
    mockGenerate.mockResolvedValue({
      text: 'hỏi_đáp',
      modelName: 'gemini-3.5-flash',
      raw: { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } },
    });

    const route = await routeQuestion('cách gửi zalo', 1);

    expect(route).toBe('hỏi_đáp');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      thinkingBudget: 0,
      maxOutputTokens: 256,
      temperature: 0,
    });
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Budget 0 is invalid. This model only works in thinking mode.',
    'thinking_budget is not supported for this model',
  ])('model thinking-only: retry khi %s', async (errMsg) => {
    mockGenerate
      .mockRejectedValueOnce(new Error(errMsg))
      .mockResolvedValueOnce({
        text: 'hỏi_đáp',
        modelName: 'gemini-2.5-pro',
        raw: { usageMetadata: { totalTokenCount: 20 } },
      });

    const route = await routeQuestion('cách gửi zalo', 1);

    expect(route).toBe('hỏi_đáp');
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      thinkingBudget: 0,
      maxOutputTokens: 256,
    });
    const secondArgs = mockGenerate.mock.calls[1][0];
    expect(secondArgs.maxOutputTokens).toBe(1024);
    expect(secondArgs).not.toHaveProperty('thinkingBudget');
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('lỗi khác — không retry', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('Thiếu GEMINI_API_KEY'));

    await expect(routeQuestion('cách gửi zalo', 1)).rejects.toThrow('Thiếu GEMINI_API_KEY');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('model trả rỗng → không_rõ + console.warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGenerate.mockResolvedValue({
      text: '',
      modelName: 'gemini-3.5-flash',
      raw: { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    });

    const route = await routeQuestion('cách gửi zalo', 1);

    expect(route).toBe('không_rõ');
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0][0])).toContain('[help_route] empty route label');
    warnSpy.mockRestore();
  });
});
