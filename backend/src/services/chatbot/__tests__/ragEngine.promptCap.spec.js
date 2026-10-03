import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * A P0-3 — trần khi dựng prompt RAG: một đoạn cũ 219.902 ký tự (chưa nạp lại) KHÔNG được chui nguyên vào prompt.
 * Mock ở ranh giới repository/embedding; ragEngine thật.
 */
const mockEmbedText = jest.fn();
const mockSearchChunks = jest.fn();
const mockSearchSimilarChunks = jest.fn();
const mockSearchChunksByChatbot = jest.fn();

jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({
  embedText: (...args) => mockEmbedText(...args),
}));
jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({
  default: { searchChunks: (...args) => mockSearchChunks(...args) },
}));
jest.unstable_mockModule('../../../repositories/ai/businessProfile.repository.js', () => ({
  default: { searchSimilarChunks: (...args) => mockSearchSimilarChunks(...args) },
}));
jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({
  default: { searchChunksByChatbot: (...args) => mockSearchChunksByChatbot(...args) },
}));

const { default: ragEngine } = await import('../ragEngine.service.js');

const HUGE = 'X'.repeat(219902);

describe('ragEngine — trần prompt (đường Studio custom chatbot)', () => {
  beforeEach(() => {
    mockEmbedText.mockReset().mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchChunks.mockReset().mockResolvedValue([]);
    mockSearchSimilarChunks.mockReset().mockResolvedValue([]);
    mockSearchChunksByChatbot.mockReset();
  });

  it('đoạn 219.902 ký tự → ngữ cảnh RAG vẫn nhỏ (đoạn ≤ 1.500, cả khối ≪ 8.000), không chứa nguyên đoạn', async () => {
    mockSearchChunksByChatbot.mockResolvedValue([
      { chunk_text: HUGE, similarity: 0.9, source: 'profile.pdf' },
      { chunk_text: 'Giờ mở cửa 8h-21h', similarity: 0.7, source: 'faq.docx' },
    ]);

    const context = await ragEngine.buildContext(7, 'mấy giờ mở cửa?', { customChatbotId: 17 });

    expect(context.length).toBeLessThan(8000);
    expect(context).not.toContain('X'.repeat(1600));
    expect(context).toContain('Giờ mở cửa 8h-21h');
    expect(context).toContain('Sources: profile.pdf, faq.docx');
  });

  it('5 đoạn × 3.000 ký tự → tổng chữ các đoạn ≤ 6.000, đoạn xếp cao nhất vào trước', async () => {
    mockSearchChunksByChatbot.mockResolvedValue(
      ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({ chunk_text: `${c} `.repeat(1500), similarity: 0.9 - i * 0.1, source: `${c}.txt` })),
    );

    const context = await ragEngine.buildContext(7, 'câu hỏi', { customChatbotId: 17 });

    const chunkTexts = context.split('\n')
      .filter((line) => /^\[\d+%\] /.test(line))
      .map((line) => line.replace(/^\[\d+%\] /, ''));
    expect(chunkTexts.reduce((sum, t) => sum + t.length, 0)).toBeLessThanOrEqual(6000);
    for (const t of chunkTexts) expect(t.length).toBeLessThanOrEqual(1500);
    expect(chunkTexts[0].startsWith('A A ')).toBe(true);
    expect(chunkTexts.some((t) => t.startsWith('E E '))).toBe(false);
  });

  it('đường KB kênh (knowledge_bases) cũng bị cắt', async () => {
    mockSearchChunks.mockResolvedValue([
      { chunk_text: HUGE, similarity: 0.8, metadata: { source: 'kb-doc' } },
    ]);

    const context = await ragEngine.buildContext(7, 'câu hỏi');

    expect(context.length).toBeLessThan(8000);
    expect(context).toContain('Sources: kb-doc');
  });

  it('đoạn đã đúng cỡ không bị đụng tới', async () => {
    const text = 'Chính sách đổi trả trong 7 ngày. '.repeat(30).trim();
    mockSearchChunksByChatbot.mockResolvedValue([{ chunk_text: text, similarity: 0.6, source: 'policy.txt' }]);

    const context = await ragEngine.buildContext(7, 'đổi trả', { customChatbotId: 17 });

    expect(context).toContain(`[60%] ${text}`);
  });
});
