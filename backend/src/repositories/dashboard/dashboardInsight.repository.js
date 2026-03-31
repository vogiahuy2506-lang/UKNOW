import db from '../../config/database.js';

/**
 * Truy vấn / ghi insight dashboard (JSONB) theo user.
 */
class DashboardInsightRepository {
  /**
   * Xóa toàn bộ insight cũ của user rồi chèn bản mới (một transaction).
   *
   * @param {number} userId
   * @param {object} payload - object sẽ lưu vào jsonb
   * @param {object|null|undefined} filtersSnapshot
   * @returns {Promise<void>}
   */
  async replaceForUser(userId, payload, filtersSnapshot) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM dashboard_insights WHERE id_user = $1', [userId]);
      await client.query(
        `INSERT INTO dashboard_insights (id_user, payload, filters_snapshot)
         VALUES ($1, $2::jsonb, $3::jsonb)`,
        [userId, JSON.stringify(payload), filtersSnapshot != null ? JSON.stringify(filtersSnapshot) : null],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Lấy bản insight mới nhất của user (sau khi xóa+hàng mới vẫn chỉ còn 1 record).
   *
   * @param {number} userId
   * @returns {Promise<{ payload: object, filters_snapshot: object|null, created_at: Date }|null>}
   */
  async findLatestByUser(userId) {
    const r = await db.query(
      `SELECT payload, filters_snapshot, created_at
       FROM dashboard_insights
       WHERE id_user = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId],
    );
    return r.rows[0] || null;
  }
}

export default new DashboardInsightRepository();
