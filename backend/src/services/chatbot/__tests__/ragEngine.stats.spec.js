import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * PR-10 mục 3(e) (A P2-10): `ragEngine.buildContext({ onStats })` báo số đoạn tài liệu / đoạn hồ sơ đã ĐƯA VÀO prompt và độ giống cao nhất, để sổ đo lường chatbot
 * biết bot nào hay "tra không ra". Chỉ ĐẾM — không đưa nội dung đoạn ra ngoài; `onStats` hỏng không làm hỏng câu trả lời. Ranh giới giả lập: embedding + repository.
 */
const mockEmbedText = jest.fn();
const mockSearchChunks = jest.fn();
const mockSearchSimilarChunks = jest.fn();
const mockSearchChunksByChatbot = jest.fn();

jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({ embedText: (...args) => mockEmbedText(...args) }));
jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({ default: { searchChunks: (...args) => mockSearchChunks(...args) } }));
jest.unstable_mockModule('../../../repositories/ai/businessProfile.repository.js', () => ({ default: { searchSimilarChunks: (...args) => mockSearchSimilarChunks(...args) } }));
jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({ default: { searchChunksByChatbot: (...args) => mockSearchChunksByChatbot(...args) } }));

const { default: ragEngine } = await import('../ragEngine.service.js');

describe('ragEngine.buildContext — onStats', () => {
  beforeEach(() => {
    mockEmbedText.mockReset().mockResolvedValue([0.1, 0.2]);
    mockSearchChunks.mockReset().mockResolvedValue([]);
    mockSearchSimilarChunks.mockReset().mockResolvedValue([]);
    mockSearchChunksByChatbot.mockReset().mockResolvedValue([]);
  });

  it('đường Studio: đếm đoạn tài liệu + đoạn hồ sơ qua ngưỡng, topSimilarity = độ giống cao nhất của đoạn tài liệu', async () => {
    mockSearchChunksByChatbot.mockResolvedValue([
      { chunk_text: 'Giờ mở cửa 8h-21h', similarity: 0.71, source: 'faq' },
      { chunk_text: 'Bảo hành 12 tháng', similarity: 0.88, source: 'faq' },
    ]);
    mockSearchSimilarChunks.mockResolvedValue([
      { chunk_text: 'Tên công ty: Hoa Nắng', similarity: 0.9 },
      { chunk_text: 'đoạn không đủ giống', similarity: 0.1 },
    ]);
    const onStats = jest.fn();

    await ragEngine.buildContext(7, 'bảo hành?', { customChatbotId: 17, onStats });

    expect(onStats).toHaveBeenCalledTimes(1);
    expect(onStats).toHaveBeenCalledWith({ kbChunks: 2, profileChunks: 1, topSimilarity: 0.88 });
  });

  it('không tra ra gì → 0 đoạn, topSimilarity null (không phải 0)', async () => {
    const onStats = jest.fn();
    await ragEngine.buildContext(7, 'câu lạ', { customChatbotId: 17, onStats });
    expect(onStats).toHaveBeenCalledWith({ kbChunks: 0, profileChunks: 0, topSimilarity: null });
  });

  it('includeProfileChunks=false → không tra hồ sơ, profileChunks 0', async () => {
    mockSearchChunksByChatbot.mockResolvedValue([{ chunk_text: 'a', similarity: 0.6, source: 's' }]);
    const onStats = jest.fn();
    await ragEngine.buildContext(7, 'q', { customChatbotId: 17, includeProfileChunks: false, onStats });
    expect(mockSearchSimilarChunks).not.toHaveBeenCalled();
    expect(onStats).toHaveBeenCalledWith({ kbChunks: 1, profileChunks: 0, topSimilarity: 0.6 });
  });

  it('onStats ném lỗi → vẫn trả đúng ngữ cảnh; không truyền onStats → như cũ', async () => {
    mockSearchChunksByChatbot.mockResolvedValue([{ chunk_text: 'Giờ mở cửa 8h-21h', similarity: 0.7, source: 'faq' }]);
    const context = await ragEngine.buildContext(7, 'q', { customChatbotId: 17, onStats: () => { throw new Error('đo lường hỏng'); } });
    expect(context).toContain('Giờ mở cửa 8h-21h');
    await expect(ragEngine.buildContext(7, 'q', { customChatbotId: 17 })).resolves.toContain('Giờ mở cửa 8h-21h');
  });

  it('onStats KHÔNG nhận nội dung đoạn', async () => {
    mockSearchChunksByChatbot.mockResolvedValue([{ chunk_text: 'Bí mật 0912345678', similarity: 0.7, source: 'faq' }]);
    const onStats = jest.fn();
    await ragEngine.buildContext(7, 'q', { customChatbotId: 17, onStats });
    expect(JSON.stringify(onStats.mock.calls)).not.toContain('0912345678');
  });
});
