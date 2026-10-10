import db from '../../config/database.js';

/**
 * Bảng `notification_event_settings` (migration 289) — cấu hình HỆ THỐNG theo sự kiện thông báo do super admin đặt: bật/tắt chuông,
 * bật/tắt email, và người dùng có được tắt email loại đó không. Thiếu dòng → mặc định trong config/notificationEventCatalog.js.
 */
class NotificationEventSettingRepository {
  /**
   * @returns {Promise<Array<{ eventType: string, inAppEnabled: boolean, emailEnabled: boolean,
   *   userCanDisableEmail: boolean, updatedBy: number|null, updatedAt: Date }>>}
   */
  async listAll() {
    const { rows } = await db.query(
      `SELECT event_type, in_app_enabled, email_enabled, user_can_disable_email, updated_by, updated_at
         FROM notification_event_settings`
    );
    return rows.map((row) => ({
      eventType: row.event_type,
      inAppEnabled: row.in_app_enabled === true,
      emailEnabled: row.email_enabled === true,
      userCanDisableEmail: row.user_can_disable_email === true,
      updatedBy: row.updated_by == null ? null : Number(row.updated_by),
      updatedAt: row.updated_at,
    }));
  }

  /**
   * @param {{ eventType: string, inAppEnabled: boolean, emailEnabled: boolean, userCanDisableEmail: boolean,
   *   updatedBy: number|null }} input
   * @returns {Promise<void>}
   */
  async upsert({ eventType, inAppEnabled, emailEnabled, userCanDisableEmail, updatedBy }) {
    await db.query(
      `INSERT INTO notification_event_settings
         (event_type, in_app_enabled, email_enabled, user_can_disable_email, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (event_type)
       DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled,
                     email_enabled = EXCLUDED.email_enabled,
                     user_can_disable_email = EXCLUDED.user_can_disable_email,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      [eventType, inAppEnabled, emailEnabled, userCanDisableEmail, updatedBy]
    );
  }
}

export default new NotificationEventSettingRepository();
