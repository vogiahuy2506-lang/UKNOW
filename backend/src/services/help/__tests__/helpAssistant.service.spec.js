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

// PLAN_VA_TRO_LY_AI_2026-09-28 PR-2 mục 1 + mục 6 — không đo được "model chọn đúng nhãn" bằng
// unit test (cần Gemini thật). Ghim câu chữ BẮT BUỘC phải còn trong prompt (bảng hằng số, ghim
// từng dòng — đột biến xoá 1 dòng phải đỏ ĐÚNG dòng đó) thay cho việc đo hành vi model.
describe('helpAssistant.service routeQuestion — ghim câu chữ prompt định tuyến (PR-2 mục 1 + 6)', () => {
  const REQUIRED_LINES = [
    'Câu bắt đầu hoặc chứa "làm sao", "cách", "vì sao", "tại sao", "ở đâu", "thế nào", "được không", "có … không" → hỏi_đáp, KỂ CẢ KHI câu có nhắc tới tạo/gửi/chạy',
    'Chỉ chọn làm_giúp khi người dùng ra LỆNH làm một việc cụ thể ngay bây giờ',
    'Một câu TUYÊN BỐ Ý ĐỊNH/hành động sắp làm',
    'Một khối văn bản dán nguyên vào (brief, mô tả sản phẩm/trang web nhiều dòng) là yêu cầu làm hộ, không phải câu hỏi',
    '"tôi log in zalo rồi, giờ tôi sẽ chọn nhóm để tạo chiến dịch" → làm_giúp',
    'Sản phẩm dịch vụ là gì? → … Thiết kế trang web để giới thiệu…',
  ];
  const FORBIDDEN_LINES = [
    'Nếu phân vân giữa hỏi_đáp và làm_giúp → chọn làm_giúp',
  ];

  beforeEach(() => {
    mockGenerate.mockReset();
    mockGenerate.mockResolvedValue({ text: 'hỏi_đáp', modelName: 'm', raw: {} });
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
  });

  it.each(REQUIRED_LINES)('prompt định tuyến CHỨA: %s', async (line) => {
    await routeQuestion('câu bất kỳ', 1);
    const systemPrompt = mockGenerate.mock.calls[0][0].systemPrompt;
    expect(systemPrompt).toContain(line);
  });

  it.each(FORBIDDEN_LINES)('prompt định tuyến KHÔNG còn luật cũ: %s', async (line) => {
    await routeQuestion('câu bất kỳ', 1);
    const systemPrompt = mockGenerate.mock.calls[0][0].systemPrompt;
    expect(systemPrompt).not.toContain(line);
  });
});
