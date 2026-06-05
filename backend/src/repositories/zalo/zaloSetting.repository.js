import db from '../../config/database.js';

class ZaloSettingRepository {
  async findActiveConnectedAccountByUser(userId) {
    const result = await db.query(
      `SELECT zs.*, zs.id as zalo_setting_id
       FROM zalo_settings zs
       WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async findActiveConnectedAccountSummaryByUser(userId) {
    const result = await db.query(
      `SELECT zs.id, zs.id as zalo_setting_id
       FROM zalo_settings zs
       WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async findActiveConnectedAccountStatusByUser(userId) {
    const result = await db.query(
      `SELECT zs.id, zs.display_name, zs.status, zs.is_active,
              (SELECT COUNT(*) FROM zalo_personal_conversations WHERE id_zalo_setting = zs.id) as conversation_count
       FROM zalo_settings zs
       WHERE zs.id_user = $1 AND zs.is_active = true AND zs.status = 'connected'
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }
}

export default new ZaloSettingRepository();
