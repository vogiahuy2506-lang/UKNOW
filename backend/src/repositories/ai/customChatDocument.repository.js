import db from '../../config/database.js';

class CustomChatDocumentRepository {
  async findChunkTexts({ chatbotId, userId }) {
    const result = await db.query(
      `SELECT chunk_text FROM custom_chatbot_chunks
       WHERE chatbot_id = $1 AND user_id = $2
       ORDER BY chunk_index`,
      [chatbotId, userId]
    );
    return result.rows.map((row) => row.chunk_text);
  }

  /**
   * Search chunks by embedding similarity using keyword matching.
   * JSONB column doesn't support vector operations, so we use text search fallback.
   */
  async searchByEmbedding({ chatbotId, userId, queryEmbedding, minSimilarity = 0.35, limit = 5 }) {
    // JSONB doesn't support pgvector operations, so return empty
    // The service will fall back to keyword matching
    console.warn('[CustomChatDocument] JSONB embedding search not supported, using keyword fallback');
    return [];
  }

  async replaceChunks({ chatbotId, userId, chunks, embeddings, source }) {
    await db.query(
      `DELETE FROM custom_chatbot_chunks WHERE chatbot_id = $1 AND user_id = $2 AND source = $3`,
      [chatbotId, userId, source]
    );

    for (let i = 0; i < chunks.length; i += 1) {
      const embedding = embeddings[i];
      // Convert JS array to JSON string for JSONB column
      const vectorJson = Array.isArray(embedding)
        ? JSON.stringify(embedding)
        : null;

      await db.query(
        `INSERT INTO custom_chatbot_chunks (chatbot_id, user_id, chunk_text, embedding, chunk_index, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [chatbotId, userId, chunks[i], vectorJson, i, source]
      );
    }
  }

  async listDocuments(chatbotId) {
    const result = await db.query(
      `SELECT id, chunk_text, source, chunk_index, created_at
       FROM custom_chatbot_chunks
       WHERE chatbot_id = $1
       ORDER BY chunk_index`,
      [chatbotId]
    );

    return result.rows;
  }

  async deleteChunksBySource(chatbotId, source) {
    const result = await db.query(
      `DELETE FROM custom_chatbot_chunks WHERE chatbot_id = $1 AND source = $2`,
      [chatbotId, source]
    );
    return result.rowCount;
  }

  async deleteChunksById(chatbotId, chunkId) {
    const { rows } = await db.query(
      `SELECT source FROM custom_chatbot_chunks WHERE chatbot_id = $1 AND id = $2 LIMIT 1`,
      [chatbotId, chunkId]
    );
    const source = rows[0]?.source;
    if (!source) return 0;
    return this.deleteChunksBySource(chatbotId, source);
  }
}

export default new CustomChatDocumentRepository();
