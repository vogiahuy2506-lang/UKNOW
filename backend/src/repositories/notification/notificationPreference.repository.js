import db from '../../config/database.js';

/**
 * Bảng `notification_preferences` (migration 289) — người dùng tắt/bật EMAIL theo loại sự kiện. Không có dòng = theo mặc định
 * hệ thống. Chuông (in-app) không có tuỳ chọn người dùng.
 */
class NotificationPreferenceRepository {
  /**
   * @param {number} userId
   * @returns {Promise<Map<string, boolean>>} eventType → emailEnabled
   */
  async listByUser(userId) {
    const { rows } = await db.query(
      `SELECT event_type, email_enabled FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );
    return new Map(rows.map((row) => [row.event_type, row.email_enabled === true]));
  }

  /**
   * Những người (trong `userIds`) đã TẮT email loại `eventType`.
   *
   * @param {string} eventType
   * @param {number[]} userIds
   * @returns {Promise<Set<number>>}
   */
  async listEmailDisabledUserIds(eventType, userIds) {
    if (!userIds.length) return new Set();
    const { rows } = await db.query(
      `SELECT user_id FROM notification_preferences
        WHERE event_type = $1 AND email_enabled = false AND user_id = ANY($2::bigint[])`,
      [eventType, userIds]
    );
    return new Set(rows.map((row) => Number(row.user_id)));
  }

  /**
   * @param {number} userId
   * @param {string} eventType
   * @param {boolean} emailEnabled
   * @returns {Promise<void>}
   */
  async upsert(userId, eventType, emailEnabled) {
    await db.query(
      `INSERT INTO notification_preferences (user_id, event_type, email_enabled, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, event_type)
       DO UPDATE SET email_enabled = EXCLUDED.email_enabled, updated_at = NOW()`,
      [userId, eventType, emailEnabled]
    );
  }
}

export default new NotificationPreferenceRepository();
