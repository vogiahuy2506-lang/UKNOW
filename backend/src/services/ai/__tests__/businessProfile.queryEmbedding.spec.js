import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-24 + EXTRA-A3 — hồ sơ doanh nghiệp (RAG cho trợ lý chiến dịch / landing): yêu cầu của người dùng embed bằng RETRIEVAL_QUERY,
 * đoạn hồ sơ lưu bằng RETRIEVAL_DOCUMENT. Bản cũ embed câu hỏi bằng kiểu mặc định DOCUMENT.
 *
 * Ngưỡng `> 0.5` GIỮ NGUYÊN (hiệu chỉnh theo kiểu cũ, chưa đo lại trên production — xem scripts/measureQueryEmbeddingThresholds.js).
 */
const findByUserId = jest.fn();
const searchSimilarChunks = jest.fn();
const deleteChunksByUserId = jest.fn();
const insertChunks = jest.fn();
const embedText = jest.fn();
const embedTexts = jest.fn();
const findAllByUser = jest.fn();

jest.unstable_mockModule('../../../repositories/ai/businessProfile.repository.js', () => ({
  default: { findByUserId, searchSimilarChunks, deleteChunksByUserId, insertChunks, upsert: jest.fn() },
}));
jest.unstable_mockModule('../../../repositories/products/product.repository.js', () => ({ default: { findAllByUser } }));
jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({
  embedText: (...args) => embedText(...args),
  embedTexts: (...args) => embedTexts(...args),
}));

const { default: svc } = await import('../businessProfile.service.js');

const VECTOR = [0.1, 0.2, 0.3];

beforeEach(() => {
  findByUserId.mockReset().mockResolvedValue({ company_name: 'Trà Sen Tây Hồ', business_description: 'Bán trà ướp sen thủ công.' });
  searchSimilarChunks.mockReset().mockResolvedValue([]);
  deleteChunksByUserId.mockReset().mockResolvedValue(undefined);
  insertChunks.mockReset().mockResolvedValue(undefined);
  embedText.mockReset().mockResolvedValue(VECTOR);
  embedTexts.mockReset().mockImplementation(async (texts) => texts.map(() => VECTOR));
  findAllByUser.mockReset().mockResolvedValue([]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('businessProfile.getContextForPrompt — yêu cầu dùng RETRIEVAL_QUERY (D-24, EXTRA-A3)', () => {
  it('embed prompt với taskType RETRIEVAL_QUERY (feature và userId giữ nguyên)', async () => {
    await svc.getContextForPrompt(90, 'Viết email giới thiệu khoá học mới');

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText.mock.calls[0][0]).toBe('Viết email giới thiệu khoá học mới');
    expect(embedText.mock.calls[0][1]).toEqual({ userId: 90, feature: 'embedding_rag_query', taskType: 'RETRIEVAL_QUERY' });
  });

  it('ngưỡng KHÔNG đổi: lấy tối đa 5 đoạn và chỉ giữ đoạn có similarity > 0,5 (0,51 vào, 0,50 và 0,30 ra)', async () => {
    searchSimilarChunks.mockResolvedValue([
      { chunk_text: 'Đoạn khớp rõ', similarity: 0.51 },
      { chunk_text: 'Đoạn đúng ngưỡng', similarity: 0.5 },
      { chunk_text: 'Đoạn lạc đề', similarity: 0.3 },
    ]);

    const context = await svc.getContextForPrompt(90, 'giới thiệu shop');

    expect(searchSimilarChunks).toHaveBeenCalledWith(90, VECTOR, 5);
    expect(context).toContain('- Đoạn khớp rõ');
    expect(context).not.toContain('Đoạn đúng ngưỡng');
    expect(context).not.toContain('Đoạn lạc đề');
  });

  it('chưa có hồ sơ → không tốn lượt embed nào', async () => {
    findByUserId.mockResolvedValue(null);

    await expect(svc.getContextForPrompt(90, 'xin chào')).resolves.toBe('');
    expect(embedText).not.toHaveBeenCalled();
  });
});

describe('businessProfile.reembedChunks — ĐOẠN HỒ SƠ vẫn lưu bằng RETRIEVAL_DOCUMENT (phía kia của cặp)', () => {
  it('embedTexts cho đoạn hồ sơ KHÔNG mang taskType RETRIEVAL_QUERY (mặc định DOCUMENT)', async () => {
    await svc.reembedChunks(90);

    expect(embedTexts).toHaveBeenCalledTimes(1);
    const options = embedTexts.mock.calls[0][1];
    expect(options.feature).toBe('embedding_business_profile');
    expect(options.taskType === undefined || options.taskType === 'RETRIEVAL_DOCUMENT').toBe(true);
  });
});
