import db from '../../config/database.js';

function parseEmbedding(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') {
    if (Buffer.isBuffer(raw)) {
      try { return parseEmbedding(raw.toString('utf8')); } catch { return null; }
    }
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class CustomChatDocumentRepository {
  async findChunkTexts({ chatbotId, userId }, queryable = db) {
    const result = await queryable.query(
      `SELECT c.chunk_text
         FROM custom_chatbot_chunks c
         JOIN custom_chatbot_documents d ON d.id = c.document_id
        WHERE c.chatbot_id = $1 AND d.owner_user_id = $2 AND d.status = 'ready'
        ORDER BY c.document_id, c.chunk_index`,
      [chatbotId, userId]
    );
    return result.rows.map((row) => row.chunk_text);
  }

  async searchByEmbedding() {
    console.warn('[CustomChatDocument] JSONB embedding search not supported, using keyword fallback');
    return [];
  }

  /**
   * Cosine similarity search over a chatbot's own KB chunks.
   * `custom_chatbot_chunks.embedding` is stored as JSONB (number array).
   * Returns the top-K chunks ordered by similarity, filtered by `minSimilarity`.
   */
  async searchChunksByChatbot(chatbotId, userId, queryEmbedding, { limit = 5, minSimilarity = 0.3 } = {}, queryable = db) {
    if (!chatbotId || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];
    const { rows } = await queryable.query(
      `SELECT c.id, c.chunk_text, c.chunk_index, c.source, c.embedding
         FROM custom_chatbot_chunks c
         JOIN custom_chatbot_documents d ON d.id = c.document_id
        WHERE c.chatbot_id = $1 AND d.owner_user_id = $2 AND d.status = 'ready'
          AND c.embedding IS NOT NULL`,
      [chatbotId, userId]
    );
    if (rows.length === 0) return [];

    const scored = [];
    for (const row of rows) {
      const vec = parseEmbedding(row.embedding);
      if (!vec || vec.length !== queryEmbedding.length) continue;
      const similarity = cosineSimilarity(vec, queryEmbedding);
      if (similarity >= minSimilarity) {
        scored.push({
          chunk_text: row.chunk_text,
          chunk_index: row.chunk_index,
          source: row.source,
          similarity,
        });
      }
    }
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  async findDocumentBySource(chatbotId, ownerUserId, sourceKey, queryable = db, { forUpdate = false } = {}) {
    const { rows } = await queryable.query(
      `SELECT * FROM custom_chatbot_documents
        WHERE chatbot_id = $1 AND owner_user_id = $2 AND source_key = $3
        LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [chatbotId, ownerUserId, sourceKey]
    );
    return rows[0] || null;
  }

  async findDocumentById(chatbotId, ownerUserId, documentId, queryable = db, { forUpdate = false } = {}) {
    const { rows } = await queryable.query(
      `SELECT * FROM custom_chatbot_documents
        WHERE chatbot_id = $1 AND owner_user_id = $2 AND id = $3
        LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
      [chatbotId, ownerUserId, documentId]
    );
    return rows[0] || null;
  }

  async findDocumentByLegacyChunkId(chatbotId, ownerUserId, chunkId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT d.*
         FROM custom_chatbot_chunks c
         JOIN custom_chatbot_documents d ON d.id = c.document_id
        WHERE c.chatbot_id = $1 AND d.owner_user_id = $2 AND c.id = $3
        LIMIT 1`,
      [chatbotId, ownerUserId, chunkId]
    );
    return rows[0] || null;
  }

  async upsertProcessingDocument({
    chatbotId, ownerUserId, sourceType, sourceKey, title, contentText, extractedChars,
  }, queryable = db) {
    const { rows } = await queryable.query(
      `INSERT INTO custom_chatbot_documents
        (chatbot_id, owner_user_id, source_type, source_key, title, content_text,
         status, error_message, extracted_chars, chunk_count, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'processing',NULL,$7,0,NOW())
       ON CONFLICT (chatbot_id, source_key) DO UPDATE SET
         owner_user_id = EXCLUDED.owner_user_id,
         source_type = EXCLUDED.source_type,
         title = EXCLUDED.title,
         content_text = EXCLUDED.content_text,
         status = 'processing',
         error_message = NULL,
         extracted_chars = EXCLUDED.extracted_chars,
         chunk_count = 0,
         updated_at = NOW()
       RETURNING *`,
      [chatbotId, ownerUserId, sourceType, sourceKey, title, contentText, extractedChars]
    );
    return rows[0];
  }

  async replaceChunks({ documentId, chatbotId, userId, chunks, embeddings, source }, queryable = db) {
    await queryable.query(`DELETE FROM custom_chatbot_chunks WHERE document_id = $1`, [documentId]);
    for (let i = 0; i < chunks.length; i += 1) {
      const embedding = embeddings[i];
      const vectorJson = Array.isArray(embedding) ? JSON.stringify(embedding) : null;
      await queryable.query(
        `INSERT INTO custom_chatbot_chunks
          (document_id, chatbot_id, user_id, chunk_text, embedding, chunk_index, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [documentId, chatbotId, userId, chunks[i], vectorJson, i, source]
      );
    }
  }

  async markReady(documentId, chunkCount, queryable = db) {
    const { rows } = await queryable.query(
      `UPDATE custom_chatbot_documents
          SET status = 'ready', error_message = NULL, chunk_count = $2, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [documentId, chunkCount]
    );
    return rows[0] || null;
  }

  async markError(documentId, errorMessage, queryable = db) {
    await queryable.query(
      `UPDATE custom_chatbot_documents
          SET status = 'error', error_message = $2, extracted_chars = 0,
              chunk_count = 0, updated_at = NOW()
        WHERE id = $1`,
      [documentId, errorMessage]
    );
  }

  async restoreDocument(document, queryable = db) {
    const { rows } = await queryable.query(
      `UPDATE custom_chatbot_documents
          SET source_type = $2, title = $3, content_text = $4, status = $5,
              error_message = $6, extracted_chars = $7, chunk_count = $8,
              updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [document.id, document.source_type, document.title, document.content_text,
       document.status, document.error_message, document.extracted_chars, document.chunk_count]
    );
    return rows[0] || null;
  }

  async listDocuments(chatbotId, ownerUserId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, title, source_key AS source, source_type AS type, status,
              chunk_count, extracted_chars, error_message, created_at, updated_at
         FROM custom_chatbot_documents
        WHERE chatbot_id = $1 AND owner_user_id = $2
        ORDER BY created_at DESC`,
      [chatbotId, ownerUserId]
    );
    return rows;
  }

  async getDocumentById(documentId, chatbotId, ownerUserId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, title, source_key AS source, source_type AS type, status,
              content_text, chunk_count, extracted_chars, error_message,
              created_at, updated_at
         FROM custom_chatbot_documents
        WHERE id = $1 AND chatbot_id = $2 AND owner_user_id = $3`,
      [documentId, chatbotId, ownerUserId]
    );
    return rows[0] || null;
  }

  async deleteDocument(documentId, chatbotId, ownerUserId, queryable = db) {
    const { rows } = await queryable.query(
      `DELETE FROM custom_chatbot_documents
        WHERE id = $1 AND chatbot_id = $2 AND owner_user_id = $3
        RETURNING id`,
      [documentId, chatbotId, ownerUserId]
    );
    return rows[0]?.id || null;
  }
}

export default new CustomChatDocumentRepository();
