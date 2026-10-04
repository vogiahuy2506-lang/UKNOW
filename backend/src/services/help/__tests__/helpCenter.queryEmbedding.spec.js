import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * D-24 + EXTRA-A3 — bài hướng dẫn: CÂU HỎI embed bằng RETRIEVAL_QUERY, ĐOẠN BÀI lưu bằng RETRIEVAL_DOCUMENT (Google tối ưu hai phía
 * theo cặp). Bản cũ embed câu hỏi bằng kiểu mặc định DOCUMENT.
 *
 * Các ngưỡng tương đồng (mặc định 0,35 ở đây) GIỮ NGUYÊN — hiệu chỉnh theo kiểu cũ, chưa đo lại trên production; ca "ngưỡng không đổi"
 * ghim điều đó để ai đổi ngưỡng phải đổi test có chủ ý (kèm số đo), không phải trượt chân.
 */
const embedText = jest.fn();
const embedTexts = jest.fn();
const searchPublishedChunks = jest.fn();
const searchPublishedChunksByKeyword = jest.fn();
const findArticleById = jest.fn();
const deleteChunksByArticleId = jest.fn();
const insertChunks = jest.fn();
const client = { query: jest.fn(), release: jest.fn() };

jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({
  embedText: (...args) => embedText(...args),
  embedTexts: (...args) => embedTexts(...args),
}));
jest.unstable_mockModule('../../../repositories/help/helpArticle.repository.js', () => ({
  searchPublishedChunks: (...args) => searchPublishedChunks(...args),
  searchPublishedChunksByKeyword: (...args) => searchPublishedChunksByKeyword(...args),
  findArticleById: (...args) => findArticleById(...args),
  deleteChunksByArticleId: (...args) => deleteChunksByArticleId(...args),
  insertChunks: (...args) => insertChunks(...args),
  listArticlesPreferLocale: jest.fn(async () => []),
}));
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => client), query: jest.fn() },
}));

const { searchHelpChunks, reindexArticle } = await import('../helpCenter.service.js');

const VECTOR = [0.1, 0.2, 0.3];

beforeEach(() => {
  embedText.mockReset().mockResolvedValue(VECTOR);
  embedTexts.mockReset().mockImplementation(async (texts) => texts.map(() => VECTOR));
  searchPublishedChunks.mockReset().mockResolvedValue([{ content_text: 'Bước 1…', similarity: 0.72, article_id: 1 }]);
  searchPublishedChunksByKeyword.mockReset().mockResolvedValue([]);
  findArticleById.mockReset().mockResolvedValue({ id: 5, body_md: '# Tạo chiến dịch\n\nBước 1: vào mục Chiến dịch.\n\nBước 2: bấm Tạo mới.' });
  deleteChunksByArticleId.mockReset().mockResolvedValue(undefined);
  insertChunks.mockReset().mockResolvedValue(undefined);
  client.query.mockReset().mockResolvedValue({ rows: [] });
  client.release.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('helpCenter.searchHelpChunks — câu hỏi dùng RETRIEVAL_QUERY (D-24, EXTRA-A3)', () => {
  it('embed câu hỏi với taskType RETRIEVAL_QUERY (feature và userId giữ nguyên)', async () => {
    await searchHelpChunks('Làm sao tạo chiến dịch email?', { userId: 42 });

    expect(embedText).toHaveBeenCalledTimes(1);
    expect(embedText.mock.calls[0][0]).toBe('Làm sao tạo chiến dịch email?');
    expect(embedText.mock.calls[0][1]).toEqual({ userId: 42, feature: 'embedding_help', taskType: 'RETRIEVAL_QUERY' });
  });

  it('ngưỡng tương đồng KHÔNG đổi: mặc định 0,35 và giá trị người gọi truyền (0,5) đi nguyên xuống truy vấn vector', async () => {
    await searchHelpChunks('câu hỏi một', { userId: 1 });
    await searchHelpChunks('câu hỏi hai', { userId: 1, minSimilarity: 0.5 });

    expect(searchPublishedChunks.mock.calls[0][1]).toMatchObject({ minSimilarity: 0.35, limit: 5 });
    expect(searchPublishedChunks.mock.calls[1][1]).toMatchObject({ minSimilarity: 0.5 });
  });

  it('embed câu hỏi lỗi → rơi về tìm từ khoá như trước (không ném)', async () => {
    embedText.mockRejectedValue(new Error('Embedding API lỗi (503)'));
    searchPublishedChunksByKeyword.mockResolvedValue([{ content_text: 'Bước…', article_id: 9, similarity: 0.4 }]);

    const result = await searchHelpChunks('tạo chiến dịch', { userId: 1 });

    expect(searchPublishedChunks).not.toHaveBeenCalled();
    expect(result.chunks).toHaveLength(1);
  });
});

describe('helpCenter.reindexArticle — ĐOẠN BÀI vẫn lưu bằng RETRIEVAL_DOCUMENT (phía kia của cặp)', () => {
  it('embedTexts cho đoạn bài KHÔNG mang taskType RETRIEVAL_QUERY (mặc định DOCUMENT)', async () => {
    await reindexArticle(5, { actorUserId: 3 });

    expect(embedTexts).toHaveBeenCalledTimes(1);
    const options = embedTexts.mock.calls[0][1];
    expect(options.feature).toBe('embedding_help');
    expect(options.taskType === undefined || options.taskType === 'RETRIEVAL_DOCUMENT').toBe(true);
  });
});
