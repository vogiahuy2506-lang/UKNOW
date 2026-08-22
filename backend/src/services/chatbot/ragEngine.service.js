import knowledgeBaseRepository from '../../repositories/ai/knowledgeBase.repository.js';
import businessProfileRepository from '../../repositories/ai/businessProfile.repository.js';
import customChatDocumentRepository from '../../repositories/ai/customChatDocument.repository.js';
import { embedText } from '../../utils/embeddingClient.util.js';

const MAX_KB_CHUNKS = 5;
const MAX_PROFILE_CHUNKS = 3;
const MIN_SIMILARITY = 0.45;
const CUSTOM_CHATBOT_MIN_SIMILARITY = 0.3;

class RagEngineService {
  /**
   * Build RAG context from KB + business profile for a given user query.
   * Combines top KB chunks + business profile chunks into a single context string.
   *
   * @param {number} userId
   * @param {string} userQuery
   * @param {object} options
   * @param {number} [options.kbId] - restrict to specific KB (channel settings path)
   * @param {number} [options.customChatbotId] - when set, query the chatbot's own KB
   *   (custom_chatbot_chunks) instead of the channel-level knowledge_bases tables.
   *   Used by chatRouter.routeChatbotMessage (Studio path).
   * @param {number} [options.maxKbChunks=5]
   * @param {number} [options.maxProfileChunks=3]
   * @param {number} [options.minSimilarity=0.45]
   * @returns {Promise<string>} context string for AI prompt
   */
  async buildContext(userId, userQuery, options = {}) {
    const {
      kbId = null,
      customChatbotId = null,
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

      return await this._buildContextInternal(userId, queryEmbedding, {
        kbId,
        customChatbotId,
        maxKbChunks,
        maxProfileChunks,
        minSimilarity,
      });
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
      customChatbotId = null,
      maxKbChunks = MAX_KB_CHUNKS,
      maxProfileChunks = MAX_PROFILE_CHUNKS,
      minSimilarity = MIN_SIMILARITY,
    } = options;

    try {
      return await this._buildContextInternal(userId, queryEmbedding, {
        kbId,
        customChatbotId,
        maxKbChunks,
        maxProfileChunks,
        minSimilarity,
      });
    } catch (e) {
      console.warn('[RAG Engine] Failed to build context with embedding:', e.message);
      return '';
    }
  }

  async _buildContextInternal(userId, queryEmbedding, {
    kbId,
    customChatbotId,
    maxKbChunks,
    maxProfileChunks,
    minSimilarity,
  }) {
    // Two KB scopes live side by side:
    //   1) channel settings path  (chatbot_settings -> knowledge_bases via sub_assistant,
    //      chatbot_zalo_account_settings, web_widget_configs): use kbId + knowledgeBaseRepository.searchChunks
    //   2) Studio custom_chatbot path (custom_chatbot_chunks owned per chatbot): use customChatDocumentRepository.searchChunksByChatbot
    // When customChatbotId is provided, prefer it and skip kb_chunks entirely.
    const kbPromise = customChatbotId
      ? customChatDocumentRepository.searchChunksByChatbot(
          customChatbotId, userId, queryEmbedding,
          { limit: maxKbChunks, minSimilarity: CUSTOM_CHATBOT_MIN_SIMILARITY }
        ).then((rows) => rows.map((r) => ({ ...r, metadata: { source: r.source } })))
      : knowledgeBaseRepository.searchChunks(
          userId, queryEmbedding,
          { kbId, limit: maxKbChunks, minSimilarity }
        );

    const profilePromise = businessProfileRepository.searchSimilarChunks(
      userId, queryEmbedding, maxProfileChunks
    );

    const [kbChunks, profileChunks] = await Promise.all([kbPromise, profilePromise]);

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
