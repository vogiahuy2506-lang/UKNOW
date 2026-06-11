import db from '../../config/database.js';

class KnowledgeBaseRepository {
  // ── Knowledge Bases ─────────────────────────────────────────────

  async findAllByUser(userId) {
    const { rows } = await db.query(
      `SELECT kb.*, sa.name AS sub_assistant_name,
              (SELECT COUNT(*) FROM kb_documents WHERE id_kb = kb.id) AS document_count,
              (SELECT COALESCE(SUM(chunk_count), 0) FROM kb_documents WHERE id_kb = kb.id) AS total_chunks
       FROM knowledge_bases kb
       LEFT JOIN sub_assistants sa ON sa.id = kb.id_sub_assistant
       WHERE kb.id_user = $1
       ORDER BY kb.created_at DESC`,
      [userId]
    );
    return rows;
  }

  async findById(id, userId) {
    const { rows } = await db.query(
      `SELECT kb.*, sa.name AS sub_assistant_name
       FROM knowledge_bases kb
       LEFT JOIN sub_assistants sa ON sa.id = kb.id_sub_assistant
       WHERE kb.id = $1 AND kb.id_user = $2`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async findByIdWithStats(id, userId) {
    const kb = await this.findById(id, userId);
    if (!kb) return null;

    const docResult = await db.query(
      `SELECT COUNT(*) AS document_count,
              COUNT(*) FILTER (WHERE status = 'ready') AS ready_count,
              COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
              COUNT(*) FILTER (WHERE status = 'error') AS error_count,
              COALESCE(SUM(chunk_count), 0) AS total_chunks
       FROM kb_documents WHERE id_kb = $1 AND id_user = $2`,
      [id, userId]
    );

    return { ...kb, ...docResult.rows[0] };
  }

  async create(userId, { name, description, id_sub_assistant, chunking_mode, chunk_size, settings }) {
    const { rows } = await db.query(
      `INSERT INTO knowledge_bases (id_user, name, description, id_sub_assistant, chunking_mode, chunk_size, settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, name, description || null, id_sub_assistant || null,
       chunking_mode || 'paragraph', chunk_size || 500, JSON.stringify(settings || {})]
    );
    return rows[0];
  }

  async update(id, userId, { name, description, id_sub_assistant, is_active, chunking_mode, chunk_size, settings }) {
    const { rows } = await db.query(
      `UPDATE knowledge_bases SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         id_sub_assistant = $5,
         is_active = COALESCE($6, is_active),
         chunking_mode = COALESCE($7, chunking_mode),
         chunk_size = COALESCE($8, chunk_size),
         settings = COALESCE($9, settings),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId, name, description, id_sub_assistant, is_active,
       chunking_mode, chunk_size, settings ? JSON.stringify(settings) : null]
    );
    return rows[0];
  }

  async delete(id, userId) {
    // CASCADE sẽ xóa kb_documents, kb_chunks
    const { rows } = await db.query(
      `DELETE FROM knowledge_bases WHERE id = $1 AND id_user = $2 RETURNING id`,
      [id, userId]
    );
    return rows[0]?.id || null;
  }

  // ── KB Documents ────────────────────────────────────────────────

  async findDocumentsByKb(kbId, userId) {
    const { rows } = await db.query(
      `SELECT * FROM kb_documents WHERE id_kb = $1 AND id_user = $2 ORDER BY created_at DESC`,
      [kbId, userId]
    );
    return rows;
  }

  async findDocumentById(id, userId) {
    const { rows } = await db.query(
      `SELECT d.* FROM kb_documents d
       INNER JOIN knowledge_bases kb ON d.id_kb = kb.id
       WHERE d.id = $1 AND kb.id_user = $2`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async createDocument(kbId, userId, { title, source_type, source_url, content_text, file_name, file_size, mime_type }) {
    const { rows } = await db.query(
      `INSERT INTO kb_documents (id_kb, id_user, title, source_type, source_url, content_text, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [kbId, userId, title, source_type, source_url || null, content_text || null,
       file_name || null, file_size || null, mime_type || null]
    );
    return rows[0];
  }

  async updateDocumentStatus(id, userId, { status, error_message, chunk_count, content_text }) {
    const { rows } = await db.query(
      `UPDATE kb_documents SET
         status = COALESCE($3, status),
         error_message = $4,
         chunk_count = COALESCE($5, chunk_count),
         content_text = COALESCE($6, content_text),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId, status, error_message || null, chunk_count, content_text]
    );
    return rows[0];
  }

  async deleteDocument(id, userId) {
    // Lấy thông tin document trước khi xóa
    const doc = await this.findDocumentById(id, userId);
    if (!doc) return null;

    // Xóa file đã upload nếu có
    if (doc.source_type === 'file') {
      try {
        const { uploadController } = await import('../../controllers/upload.controller.js');
        await uploadController.deleteTempFileById(`kb_${id}`, null);
      } catch (e) {
        console.warn(`[KB] Could not delete uploaded file for doc ${id}:`, e.message);
      }
    }

    // Xóa chunks trước (đảm bảo không có FK conflict)
    try {
      await this.deleteChunksByDocId(id);
    } catch (e) {
      console.warn(`[KB] Could not delete chunks for doc ${id}:`, e.message);
    }

    // Xóa document
    try {
      const { rows } = await db.query(
        `DELETE FROM kb_documents WHERE id = $1 AND id_kb IN
         (SELECT id FROM knowledge_bases WHERE id_user = $2) RETURNING id`,
        [id, userId]
      );
      return rows[0]?.id || null;
    } catch (dbErr) {
      console.error(`[KB] deleteDocument DB error for doc ${id}:`, dbErr.message);
      throw dbErr;
    }
  }

  // ── KB Chunks ──────────────────────────────────────────────────

  async deleteChunksByDocId(docId) {
    await db.query(`DELETE FROM kb_chunks WHERE id_document = $1`, [docId]);
  }

  async insertChunksBatched(docId, kbId, userId, chunks) {
    if (!chunks.length) return;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      await db.query(
        `INSERT INTO kb_chunks (id_document, id_kb, id_user, embedding, chunk_text, metadata, chunk_index)
         VALUES ($1, $2, $3, $4::vector, $5, $6::jsonb, $7)`,
        [docId, kbId, userId, JSON.stringify(c.embedding), c.text, JSON.stringify(c.metadata || {}), i]
      );
    }
  }

  /**
   * Semantic search over KB chunks.
   * @param {number} userId
   * @param {number[]} queryEmbedding - 768-dim vector
   * @param {object} options
   * @returns {Promise<Array>}
   */
  async searchChunks(userId, queryEmbedding, { kbId = null, limit = 5, minSimilarity = 0.5 } = {}) {
    let query;
    let params;

    if (kbId) {
      // Params: $1=userId, $2=embedding, $3=limit, $4=kbId, $5=minSimilarity
      query = `
        SELECT chunk_text, metadata, chunk_index,
               1 - (embedding <=> $2::vector) AS similarity
        FROM kb_chunks
        WHERE id_user = $1
          AND 1 - (embedding <=> $2::vector) >= $5
          AND id_kb = $4
        ORDER BY embedding <=> $2::vector
        LIMIT $3`;
      params = [userId, JSON.stringify(queryEmbedding), limit, kbId, minSimilarity];
    } else {
      // Params: $1=userId, $2=embedding, $3=limit, $4=minSimilarity
      query = `
        SELECT chunk_text, metadata, chunk_index,
               1 - (embedding <=> $2::vector) AS similarity
        FROM kb_chunks
        WHERE id_user = $1
          AND 1 - (embedding <=> $2::vector) >= $4
        ORDER BY embedding <=> $2::vector
        LIMIT $3`;
      params = [userId, JSON.stringify(queryEmbedding), limit, minSimilarity];
    }

    const { rows } = await db.query(query, params);
    return rows;
  }

  async getChunksByKbId(kbId, userId, { limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT c.*, d.title AS document_title, d.source_type
       FROM kb_chunks c
       JOIN kb_documents d ON d.id = c.id_document
       WHERE c.id_kb = $1 AND c.id_user = $2
       ORDER BY c.id_document, c.chunk_index
       LIMIT $3 OFFSET $4`,
      [kbId, userId, limit, offset]
    );
    return rows;
  }
}

export default new KnowledgeBaseRepository();
