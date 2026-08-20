import db from '../../config/database.js';

class AiActivitySummaryRepository {
  /**
   * Lấy bản tóm tắt đã cache của user trong ngày
   * @param {number} userId
   * @param {string} dayKey (YYYYMMDD)
   * @returns {Promise<object|null>}
   */
  async findByUserAndDay(userId, dayKey, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT id, id_user, day_key, last_message_at, payload, created_at, updated_at
       FROM ai_activity_summaries
       WHERE id_user = $1 AND day_key = $2
       LIMIT 1`,
      [userId, dayKey]
    );
    return rows[0] || null;
  }

  /**
   * Lưu hoặc cập nhật cache tóm tắt
   * @param {number} userId
   * @param {string} dayKey
   * @param {string|Date|null} lastMessageAt
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async upsertSummary(userId, dayKey, lastMessageAt, payload, queryable = db) {
    const { rows } = await queryable.query(
      `INSERT INTO ai_activity_summaries (id_user, day_key, last_message_at, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (id_user, day_key) DO UPDATE
       SET last_message_at = EXCLUDED.last_message_at,
           payload = EXCLUDED.payload,
           updated_at = NOW()
       RETURNING *`,
      [userId, dayKey, lastMessageAt, JSON.stringify(payload)]
    );
    return rows[0] || null;
  }
}

export default new AiActivitySummaryRepository();
