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

  async replaceChunks({ chatbotId, userId, chunks, embeddings, source }) {
    await db.query(
      `DELETE FROM custom_chatbot_chunks WHERE chatbot_id = $1`,
      [chatbotId]
    );

    for (let i = 0; i < chunks.length; i += 1) {
      await db.query(
        `INSERT INTO custom_chatbot_chunks (chatbot_id, user_id, chunk_text, embedding, chunk_index, source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [chatbotId, userId, chunks[i], embeddings[i] || null, i, source]
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
}

export default new CustomChatDocumentRepository();
