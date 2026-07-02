import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import businessProfileRepository from '../../repositories/ai/businessProfile.repository.js';
import { embedText } from '../../utils/embeddingClient.util.js';

const MAX_KB_CHUNKS = 5;
const MAX_PROFILE_CHUNKS = 3;
const MIN_SIMILARITY = 0.45;

class RagEngineService {
  /**
   * Build RAG context from KB + business profile for a given user query.
   * Combines top KB chunks + business profile chunks into a single context string.
   *
   * @param {number} userId
   * @param {string} userQuery
   * @param {object} options
   * @param {number} [options.kbId] - restrict to specific KB
   * @param {number} [options.maxKbChunks=5]
   * @param {number} [options.maxProfileChunks=3]
   * @param {number} [options.minSimilarity=0.45]
   * @returns {Promise<string>} context string for AI prompt
   */
  async buildContext(userId, userQuery, options = {}) {
    const {
      kbId = null,
      maxKbChunks = MAX_KB_CHUNKS,
      maxProfileChunks = MAX_PROFILE_CHUNKS,
      minSimilarity = MIN_SIMILARITY,
    } = options;

    try {
      // 1. Embed user query (single call)
      const queryEmbedding = await embedText(userQuery, {
        userId,
        feature: 'embedding_rag_query',
      });

      // 2. Search KB chunks + business profile chunks in PARALLEL
      // Both searches only depend on queryEmbedding, so they can run concurrently
      const [kbChunks, profileChunks] = await Promise.all([
        knowledgeBaseRepository.searchChunks(
          userId, queryEmbedding,
          { kbId, limit: maxKbChunks, minSimilarity }
        ),
        businessProfileRepository.searchSimilarChunks(
          userId, queryEmbedding, maxProfileChunks
        ),
      ]);

      // 3. Format KB context
      let kbContext = '';
      if (kbChunks.length > 0) {
        const sources = [...new Set(kbChunks.map(c => c.metadata?.source || 'Document'))];
        kbContext = [
          `=== KNOWLEDGE BASE (trained data) ===`,
          `Sources: ${sources.join(', ')}`,
          '',
          ...kbChunks.map(c => `[${(c.similarity * 100).toFixed(0)}%] ${c.chunk_text}`),
          '',
        ].join('\n');
      }

      // 4. Format profile context
      let profileContext = '';
      if (profileChunks.length > 0) {
        profileContext = [
          `=== BUSINESS PROFILE CONTEXT ===`,
          ...profileChunks
            .filter(c => c.similarity > minSimilarity)
            .map(c => `- ${c.chunk_text}`),
        ].join('\n');
      }

      const parts = [];
      if (kbContext) parts.push(kbContext);
      if (profileContext) parts.push(profileContext);

      return parts.join('\n\n');
    } catch (e) {
      console.warn('[RAG Engine] Failed to build context, continuing without RAG:', e.message);
      return '';
    }
  }

  /**
   * Build RAG context with a pre-computed embedding (avoid re-embedding same query).
   * Use this when embedding was already computed externally.
   *
   * @param {number} userId
   * @param {number[]} queryEmbedding - pre-computed embedding vector
   * @param {object} options
   * @returns {Promise<string>}
   */
  async buildContextWithEmbedding(userId, queryEmbedding, options = {}) {
    const {
      kbId = null,
      maxKbChunks = MAX_KB_CHUNKS,
      maxProfileChunks = MAX_PROFILE_CHUNKS,
      minSimilarity = MIN_SIMILARITY,
    } = options;

    try {
      const [kbChunks, profileChunks] = await Promise.all([
        knowledgeBaseRepository.searchChunks(
          userId, queryEmbedding,
          { kbId, limit: maxKbChunks, minSimilarity }
        ),
        businessProfileRepository.searchSimilarChunks(
          userId, queryEmbedding, maxProfileChunks
        ),
      ]);

      let kbContext = '';
      if (kbChunks.length > 0) {
        const sources = [...new Set(kbChunks.map(c => c.metadata?.source || 'Document'))];
        kbContext = [
          `=== KNOWLEDGE BASE (trained data) ===`,
          `Sources: ${sources.join(', ')}`,
          '',
          ...kbChunks.map(c => `[${(c.similarity * 100).toFixed(0)}%] ${c.chunk_text}`),
          '',
        ].join('\n');
      }

      let profileContext = '';
      if (profileChunks.length > 0) {
        profileContext = [
          `=== BUSINESS PROFILE CONTEXT ===`,
          ...profileChunks
            .filter(c => c.similarity > minSimilarity)
            .map(c => `- ${c.chunk_text}`),
        ].join('\n');
      }

      const parts = [];
      if (kbContext) parts.push(kbContext);
      if (profileContext) parts.push(profileContext);

      return parts.join('\n\n');
    } catch (e) {
      console.warn('[RAG Engine] Failed to build context with embedding:', e.message);
      return '';
    }
  }

  /**
   * Check if a KB has any relevant chunks for a query.
   * Returns true if at least one chunk passes the similarity threshold.
   */
  async hasRelevantContent(userId, userQuery, kbId = null) {
    try {
      const queryEmbedding = await embedText(userQuery, {
        userId,
        feature: 'embedding_rag_query',
      });
      const chunks = await knowledgeBaseRepository.searchChunks(
        userId, queryEmbedding,
        { kbId, limit: 1, minSimilarity: MIN_SIMILARITY }
      );
      return chunks.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get summary stats for a user's KB content.
   */
  async getContentSummary(userId) {
    try {
      const result = await knowledgeBaseRepository.searchChunks(
        userId, 'knowledge base summary',
        { limit: 1000, minSimilarity: 0 }
      );
      const sources = [...new Set(result.map(c => c.metadata?.source || 'Document'))];
      return {
        totalChunks: result.length,
        uniqueSources: sources.length,
        sources,
      };
    } catch {
      return { totalChunks: 0, uniqueSources: 0, sources: [] };
    }
  }
}

export default new RagEngineService();
