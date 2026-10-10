import db from '../../config/database.js';

/**
 * Bảng `user_notifications` (migration 288) — hộp thư chuông thông báo trong app. Một dòng = một thông báo cho một người dùng.
 */
class UserNotificationRepository {
  /**
   * Chèn thông báo cho NHIỀU người bằng MỘT câu lệnh (`unnest` mảng id), JOIN `users` để id không còn tồn tại / tài khoản đã
   * vô hiệu hoá bị bỏ qua thay vì làm hỏng cả lô bằng lỗi khoá ngoại (cùng tập trạng thái với authMiddleware). Có `dedupeKey` thì `ON CONFLICT (user_id, dedupe_key) DO NOTHING`: người nào đã có dòng
   * cùng khoá thì không chèn lại — kết quả chỉ trả id những người THỰC SỰ vừa được chèn (dispatcher dùng để không gửi email lại).
   *
   * @param {object} input
   * @param {number[]} input.userIds
   * @param {string} input.eventType
   * @param {string} input.title
   * @param {string|null} [input.titleEn]
   * @param {string} input.message
   * @param {string|null} [input.messageEn]
   * @param {string|null} [input.link]
   * @param {'info'|'success'|'warning'|'error'} [input.severity]
   * @param {object} [input.metadata]
   * @param {number|null} [input.notificationId]
   * @param {string|null} [input.dedupeKey]
   * @returns {Promise<number[]>} id những người vừa được chèn dòng mới
   */
  async insertMany({
    userIds,
    eventType,
    title,
    titleEn = null,
    message,
    messageEn = null,
    link = null,
    severity = 'info',
    metadata = {},
    notificationId = null,
    dedupeKey = null,
  }) {
    const { rows } = await db.query(
      `INSERT INTO user_notifications
         (user_id, event_type, title, title_en, message, message_en, link, severity, metadata, notification_id, dedupe_key)
       SELECT us.id, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11
         FROM unnest($1::bigint[]) AS t(uid)
         JOIN users us ON us.id = t.uid AND us.status IN ('active', 'pending_activation')
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
       RETURNING user_id`,
      [
        userIds,
        eventType,
        title,
        titleEn,
        message,
        messageEn,
        link,
        severity,
        JSON.stringify(metadata || {}),
        notificationId,
        dedupeKey,
      ]
    );
    return rows.map((row) => Number(row.user_id));
  }

  /**
   * @param {{ userId: number, page: number, limit: number, unreadOnly?: boolean }} input
   * @returns {Promise<{ rows: object[], total: number }>}
   */
  async list({ userId, page, limit, unreadOnly = false }) {
    const offset = (page - 1) * limit;
    const unreadClause = unreadOnly ? 'AND read_at IS NULL' : '';
    const [listResult, countResult] = await Promise.all([
      db.query(
        `SELECT id, event_type, title, title_en, message, message_en, link, severity, metadata,
                notification_id, read_at, created_at
           FROM user_notifications
          WHERE user_id = $1 ${unreadClause}
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      db.query(
        `SELECT COUNT(*)::int AS total FROM user_notifications WHERE user_id = $1 ${unreadClause}`,
        [userId]
      ),
    ]);
    return { rows: listResult.rows, total: countResult.rows[0]?.total ?? 0 };
  }

  /**
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async countUnread(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM user_notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return rows[0]?.total ?? 0;
  }

  /**
   * Đánh dấu đã đọc MỘT thông báo của CHÍNH người dùng. Id của người khác / không tồn tại → null (controller trả 404, không
   * lộ việc dòng đó có tồn tại). Đã đọc rồi thì giữ nguyên `read_at` cũ.
   *
   * @param {number|string} id
   * @param {number} userId
   * @returns {Promise<{ id: number, read_at: Date }|null>}
   */
  async markRead(id, userId) {
    const { rows } = await db.query(
      `UPDATE user_notifications
          SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND user_id = $2
        RETURNING id, read_at`,
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * @param {number} userId
   * @returns {Promise<number>} số dòng vừa chuyển sang đã đọc
   */
  async markAllRead(userId) {
    const result = await db.query(
      `UPDATE user_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Dọn thông báo cũ: đã đọc quá `readDays` ngày, hoặc chưa đọc quá `unreadDays` ngày (tính từ lúc tạo).
   *
   * @param {{ readDays: number, unreadDays: number }} input
   * @returns {Promise<{ readDeleted: number, unreadDeleted: number }>}
   */
  async deleteExpired({ readDays, unreadDays }) {
    const readResult = await db.query(
      `DELETE FROM user_notifications
        WHERE read_at IS NOT NULL AND read_at < NOW() - make_interval(days => $1::int)`,
      [readDays]
    );
    const unreadResult = await db.query(
      `DELETE FROM user_notifications
        WHERE read_at IS NULL AND created_at < NOW() - make_interval(days => $1::int)`,
      [unreadDays]
    );
    return { readDeleted: readResult.rowCount ?? 0, unreadDeleted: unreadResult.rowCount ?? 0 };
  }

  /**
   * Địa chỉ email + tên của người nhận (chỉ tài khoản đang hoạt động, có email) cho phần gửi email của dispatcher.
   *
   * @param {number[]} userIds
   * @returns {Promise<Array<{ id: number, email: string, fullName: string|null }>>}
   */
  async findEmailContacts(userIds) {
    if (!userIds.length) return [];
    const { rows } = await db.query(
      `SELECT id, email, full_name
         FROM users
        WHERE id = ANY($1::bigint[]) AND status = 'active' AND email IS NOT NULL AND email <> ''
        ORDER BY id`,
      [userIds]
    );
    return rows.map((row) => ({
      id: Number(row.id),
      email: String(row.email).trim(),
      fullName: row.full_name || null,
    }));
  }

  /**
   * @returns {Promise<number[]>} id mọi super admin đang hoạt động
   */
  async listActiveAdminIds() {
    const { rows } = await db.query(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id`
    );
    return rows.map((row) => Number(row.id));
  }
}

export default new UserNotificationRepository();
