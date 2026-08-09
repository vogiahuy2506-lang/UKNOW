import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGenerate = jest.fn();
const mockRecord = jest.fn();
const mockSearchHelpChunks = jest.fn();
const mockGetCapabilityMapText = jest.fn();
const mockInsertUnanswered = jest.fn();

jest.unstable_mockModule('../geminiText.util.js', () => ({
  generateGeminiText: mockGenerate,
}));

jest.unstable_mockModule('../../ai/aiUsageMeter.service.js', () => ({
  default: { record: mockRecord, reserve: jest.fn() },
}));

jest.unstable_mockModule('../helpCenter.service.js', () => ({
  getCapabilityMapText: mockGetCapabilityMapText,
  searchHelpChunks: mockSearchHelpChunks,
}));

jest.unstable_mockModule('../../../repositories/help/helpArticle.repository.js', () => ({
  insertUnanswered: mockInsertUnanswered,
}));

const {
  tryHandleHelpChat,
  HELP_ROUTE_LABELS,
} = await import('../helpAssistant.service.js');

describe('tryHandleHelpChat route branches', () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
    mockSearchHelpChunks.mockReset();
    mockGetCapabilityMapText.mockReset();
    mockInsertUnanswered.mockReset();
    mockGetCapabilityMapText.mockResolvedValue('');
    mockSearchHelpChunks.mockResolvedValue({ chunks: [], topSimilarity: 0 });
  });

  function historyWith(text) {
    return [{ role: 'user', content: text }];
  }

  it('làm_giúp → null (lọt xuống AI)', async () => {
    mockGenerate.mockResolvedValue({ text: 'làm_giúp', modelName: 'm', raw: {} });
    await expect(tryHandleHelpChat({ history: historyWith('tạo chiến dịch'), userId: 1 }))
      .resolves.toBeNull();
  });

  it('không_rõ → null (thả xuống AI, không CLARIFY cứng)', async () => {
    mockGenerate.mockResolvedValue({ text: 'không_rõ', modelName: 'm', raw: {} });
    await expect(tryHandleHelpChat({ history: historyWith('Zalo'), userId: 1 }))
      .resolves.toBeNull();
  });

  it('hỏi_đáp → answerWithDocs (không null)', async () => {
    mockGenerate
      .mockResolvedValueOnce({ text: 'hỏi_đáp', modelName: 'm', raw: {} })
      .mockResolvedValueOnce({
        text: 'Hướng dẫn tạo chiến dịch...',
        modelName: 'm',
        raw: {},
      });
    mockSearchHelpChunks.mockResolvedValue({
      chunks: [{ slug: 'chien-dich-zalo', title: 'Zalo', content_text: 'bước 1' }],
      topSimilarity: 0.9,
    });

    const result = await tryHandleHelpChat({
      history: historyWith('làm sao tạo chiến dịch Zalo?'),
      userId: 1,
    });
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.hỏi_đáp);
    expect(String(result.content || '')).toBeTruthy();
  });

  it('ngoài_phạm_vi → OUT_OF_SCOPE (không null)', async () => {
    mockGenerate.mockResolvedValue({ text: 'ngoài_phạm_vi', modelName: 'm', raw: {} });
    const result = await tryHandleHelpChat({
      history: historyWith('thời tiết hôm nay'),
      userId: 1,
    });
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.ngoài_phạm_vi);
    expect(String(result.content || '')).toMatch(/ngoài phạm vi/i);
  });

  it('extractLastUserText rỗng → CLARIFY (không gọi route)', async () => {
    const result = await tryHandleHelpChat({
      history: [{ role: 'assistant', content: 'Xin chào' }],
      userId: 1,
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result.data?.helpRoute).toBe(HELP_ROUTE_LABELS.không_rõ);
    expect(String(result.content || '')).toMatch(/hướng dẫn|làm giúp/i);
  });
});
