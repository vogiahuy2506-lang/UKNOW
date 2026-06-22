import db from '../../config/database.js';

class BusinessProfileRepository {
  /**
   * Lấy hồ sơ doanh nghiệp của user.
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findByUserId(userId) {
    const { rows } = await db.query(
      `SELECT id, user_id, company_name, industry, products, target_audience,
              tone, brand_color, logo_url, extra_context, created_at, updated_at
       FROM business_profiles WHERE user_id = $1`,
      [userId]
    );
    return rows[0] || null;
  }

  /**
   * Tạo mới hoặc cập nhật hồ sơ doanh nghiệp.
   * @param {number} userId
   * @param {object} data
   * @returns {Promise<object>}
   */
  async upsert(userId, { company_name, industry, products, target_audience, tone, brand_color, logo_url, extra_context }) {
    const { rows } = await db.query(
      `INSERT INTO business_profiles
         (user_id, company_name, industry, products, target_audience, tone, brand_color, logo_url, extra_context, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         company_name    = EXCLUDED.company_name,
         industry        = EXCLUDED.industry,
         target_audience = EXCLUDED.target_audience,
         tone            = EXCLUDED.tone,
         brand_color     = EXCLUDED.brand_color,
         logo_url        = EXCLUDED.logo_url,
         extra_context   = EXCLUDED.extra_context,
         updated_at      = NOW()
       RETURNING *`,
      [userId, company_name, industry, products ?? '[]', target_audience, tone, brand_color, logo_url || null, extra_context]
    );
    return rows[0];
  }

  /**
   * Xóa toàn bộ chunks cũ của user trước khi re-embed.
   * @param {number} userId
   */
  async deleteChunksByUserId(userId) {
    await db.query(`DELETE FROM business_profile_chunks WHERE user_id = $1`, [userId]);
  }

  /**
   * Lưu nhiều chunks + embeddings cùng lúc.
   * @param {number} userId
   * @param {Array<{text: string, embedding: number[], metadata?: object}>} chunks
   */
  async insertChunks(userId, chunks) {
    if (!chunks.length) return;
    const values = chunks.map((c, i) => {
      const base = i * 4;
      return `($${base + 1}, $${base + 2}, $${base + 3}::vector, $${base + 4}::jsonb)`;
    });
    const params = chunks.flatMap(c => [
      userId,
      c.text,
      JSON.stringify(c.embedding),
      JSON.stringify(c.metadata || {}),
    ]);
    await db.query(
      `INSERT INTO business_profile_chunks (user_id, chunk_text, embedding, metadata)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  /**
   * Tìm chunks tương tự nhất với query embedding (cosine similarity).
   * @param {number} userId
   * @param {number[]} queryEmbedding  vector 768 chiều
   * @param {number} limit
   * @returns {Promise<Array<{chunk_text: string, similarity: number, metadata: object}>>}
   */
  async searchSimilarChunks(userId, queryEmbedding, limit = 5) {
    const { rows } = await db.query(
      `SELECT chunk_text, metadata,
              1 - (embedding <=> $2::vector) AS similarity
       FROM business_profile_chunks
       WHERE user_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      [userId, JSON.stringify(queryEmbedding), limit]
    );
    return rows;
  }
}

export default new BusinessProfileRepository();
