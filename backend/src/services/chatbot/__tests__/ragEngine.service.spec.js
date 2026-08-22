import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockEmbedText = jest.fn();
const mockSearchChunks = jest.fn();
const mockSearchSimilarChunks = jest.fn();
const mockSearchChunksByChatbot = jest.fn();

jest.unstable_mockModule('../../../utils/embeddingClient.util.js', () => ({
  embedText: (...args) => mockEmbedText(...args),
}));

jest.unstable_mockModule('../../../repositories/ai/knowledgeBase.repository.js', () => ({
  default: {
    searchChunks: (...args) => mockSearchChunks(...args),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/businessProfile.repository.js', () => ({
  default: {
    searchSimilarChunks: (...args) => mockSearchSimilarChunks(...args),
  },
}));

jest.unstable_mockModule('../../../repositories/ai/customChatDocument.repository.js', () => ({
  default: {
    searchChunksByChatbot: (...args) => mockSearchChunksByChatbot(...args),
  },
}));

const { default: ragEngine } = await import('../ragEngine.service.js');

describe('ragEngine.service', () => {
  beforeEach(() => {
    mockEmbedText.mockClear();
    mockSearchChunks.mockClear();
    mockSearchSimilarChunks.mockClear();
    mockSearchChunksByChatbot.mockClear();
    jest.resetModules();

    mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
    mockSearchChunks.mockResolvedValue([
      { chunk_text: 'KB chunk 1', similarity: 0.8, metadata: { source: 'doc1' } },
    ]);
    mockSearchSimilarChunks.mockResolvedValue([
      { chunk_text: 'Profile chunk 1', similarity: 0.7 },
    ]);
    mockSearchChunksByChatbot.mockResolvedValue([]);
  });

  describe('buildContext', () => {
    it('embeds query and searches both KB and profile', async () => {
      await ragEngine.buildContext(1, 'test query');

      expect(mockEmbedText).toHaveBeenCalledWith('test query', expect.objectContaining({
        feature: 'embedding_rag_query',
      }));
      expect(mockSearchChunks).toHaveBeenCalled();
      expect(mockSearchSimilarChunks).toHaveBeenCalled();
    });

    it('formats KB context with sources and similarity', async () => {
      mockSearchChunks.mockResolvedValue([
        { chunk_text: 'KB chunk 1', similarity: 0.85, metadata: { source: 'doc1' } },
        { chunk_text: 'KB chunk 2', similarity: 0.75, metadata: { source: 'doc2' } },
      ]);

      const context = await ragEngine.buildContext(1, 'test query');

      expect(context).toContain('KNOWLEDGE BASE');
      expect(context).toContain('Sources: doc1, doc2');
      expect(context).toContain('[85%] KB chunk 1');
      expect(context).toContain('[75%] KB chunk 2');
    });

    it('formats profile context with similarity filter', async () => {
      mockSearchSimilarChunks.mockResolvedValue([
        { chunk_text: 'Profile 1', similarity: 0.6 },
        { chunk_text: 'Profile 2', similarity: 0.4 }, // Below threshold
      ]);

      const context = await ragEngine.buildContext(1, 'test query');

      expect(context).toContain('BUSINESS PROFILE CONTEXT');
      expect(context).toContain('- Profile 1');
      expect(context).not.toContain('- Profile 2');
    });

    it('returns empty string on error', async () => {
      mockEmbedText.mockRejectedValue(new Error('API error'));

      const context = await ragEngine.buildContext(1, 'test query');

      expect(context).toBe('');
    });

    it('returns empty string when no chunks found', async () => {
      mockSearchChunks.mockResolvedValue([]);
      mockSearchSimilarChunks.mockResolvedValue([]);

      const context = await ragEngine.buildContext(1, 'test query');

      expect(context).toBe('');
    });

    it('respects kbId option', async () => {
      await ragEngine.buildContext(1, 'test query', { kbId: 42 });

      expect(mockSearchChunks).toHaveBeenCalledWith(
        1,
        expect.any(Array),
        expect.objectContaining({ kbId: 42 })
      );
    });

    // Bug 2.3 revised: custom_chatbot path queries custom_chatbot_chunks
    // directly by chatbot_id, bypassing the channel-level knowledge_bases
    // (kb_chunks) entirely.
    it('routes to searchChunksByChatbot when customChatbotId is provided', async () => {
      mockSearchChunksByChatbot.mockResolvedValue([
        { chunk_text: 'studio doc 1', similarity: 0.7, source: 'studio source' },
      ]);

      const context = await ragEngine.buildContext(1, 'test query', { customChatbotId: 5 });

      expect(mockSearchChunksByChatbot).toHaveBeenCalledWith(
        5, 1, expect.any(Array),
        expect.objectContaining({ limit: 5 })
      );
      // kb_chunks path must be skipped entirely when customChatbotId is set.
      expect(mockSearchChunks).not.toHaveBeenCalled();
      expect(context).toContain('KNOWLEDGE BASE');
      expect(context).toContain('Sources: studio source');
      expect(context).toContain('[70%] studio doc 1');
    });

    it('falls back to kb_chunks when customChatbotId is not provided', async () => {
      await ragEngine.buildContext(1, 'test query');

      expect(mockSearchChunks).toHaveBeenCalled();
      expect(mockSearchChunksByChatbot).not.toHaveBeenCalled();
    });
  });

  describe('buildContextWithEmbedding', () => {
    it('skips embedding and uses pre-computed vector', async () => {
      const precomputedEmbedding = [0.1, 0.2, 0.3];
      await ragEngine.buildContextWithEmbedding(1, precomputedEmbedding);

      expect(mockEmbedText).not.toHaveBeenCalled();
      expect(mockSearchChunks).toHaveBeenCalled();
      expect(mockSearchSimilarChunks).toHaveBeenCalled();
    });

    it('returns formatted context', async () => {
      const context = await ragEngine.buildContextWithEmbedding(1, [0.1, 0.2, 0.3]);

      expect(context).toContain('KNOWLEDGE BASE');
      expect(context).toContain('BUSINESS PROFILE CONTEXT');
    });
  });

  describe('hasRelevantContent', () => {
    it('returns true when relevant chunk exists', async () => {
      mockSearchChunks.mockResolvedValue([{ chunk_text: 'found' }]);

      const result = await ragEngine.hasRelevantContent(1, 'test query');

      expect(result).toBe(true);
    });

    it('returns false when no relevant chunks', async () => {
      mockSearchChunks.mockResolvedValue([]);

      const result = await ragEngine.hasRelevantContent(1, 'test query');

      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockEmbedText.mockRejectedValue(new Error('API error'));

      const result = await ragEngine.hasRelevantContent(1, 'test query');

      expect(result).toBe(false);
    });
  });
});
