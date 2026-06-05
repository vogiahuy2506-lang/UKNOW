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

  async updateAccountAfterCookieLogin(userId, accountId, { displayName, zaloUserId, zaloName, zaloPhone, cookieText }, now) {
    const { rows } = await db.query(
      `UPDATE zalo_settings
       SET display_name = COALESCE(NULLIF($1, ''), display_name),
           zalo_user_id = COALESCE(NULLIF($2, ''), zalo_user_id),
           zalo_name = COALESCE(NULLIF($3, ''), zalo_name),
           zalo_phone = COALESCE(NULLIF($4, ''), zalo_phone),
           cookie_text = COALESCE(NULLIF($5, ''), cookie_text),
           status = 'connected',
           is_active = TRUE,
           last_connected_at = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $7 AND id = $8
       RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
      [displayName, zaloUserId, zaloName, zaloPhone, cookieText, now, userId, accountId]
    );
    return rows[0] || null;
  }

  async markAccountDisconnected(userId, accountId) {
    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $1 AND id = $2`,
      [userId, accountId]
    );
  }

  async findByZaloUserId(userId, zaloUserId) {
    const { rows } = await db.query(
      `SELECT id FROM zalo_settings WHERE id_user = $1 AND zalo_user_id = $2 LIMIT 1`,
      [userId, zaloUserId]
    );
    return rows[0] || null;
  }

  async updateQrConnectedById(accountId, { displayName, zaloName, zaloPhone, cookieText }, now) {
    const { rows } = await db.query(
      `UPDATE zalo_settings
       SET display_name = COALESCE(NULLIF($1, ''), display_name),
           zalo_name = COALESCE(NULLIF($2, ''), zalo_name),
           zalo_phone = COALESCE(NULLIF($3, ''), zalo_phone),
           cookie_text = COALESCE(NULLIF($4, ''), cookie_text),
           login_method = 'qr',
           status = 'connected',
           is_active = TRUE,
           last_connected_at = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
      [displayName, zaloName, zaloPhone, cookieText, now, accountId]
    );
    return rows[0] || null;
  }

  async findByDisplayName(userId, displayName) {
    const { rows } = await db.query(
      `SELECT id FROM zalo_settings WHERE id_user = $1 AND display_name = $2 LIMIT 1`,
      [userId, displayName]
    );
    return rows[0] || null;
  }

  async updateQrConnectedByDisplayNameId(accountId, { zaloUserId, zaloName, zaloPhone, cookieText, displayName }, now) {
    const { rows } = await db.query(
      `UPDATE zalo_settings
       SET zalo_user_id = COALESCE(NULLIF($1, ''), zalo_user_id),
           zalo_name = COALESCE(NULLIF($2, ''), zalo_name),
           zalo_phone = COALESCE(NULLIF($3, ''), zalo_phone),
           cookie_text = COALESCE(NULLIF($4, ''), cookie_text),
           display_name = COALESCE(NULLIF($5, ''), display_name),
           login_method = 'qr',
           status = 'connected',
           is_active = TRUE,
           last_connected_at = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
      [zaloUserId, zaloName, zaloPhone, cookieText, displayName, now, accountId]
    );
    return rows[0] || null;
  }

  async countByUserId(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS total FROM zalo_settings WHERE id_user = $1`,
      [userId]
    );
    return rows[0]?.total ?? 0;
  }

  async insertAccount(userId, { displayName, zaloUserId, zaloName, zaloPhone, cookieText }, isDefault, now) {
    const { rows } = await db.query(
      `INSERT INTO zalo_settings (
        id_user, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, cookie_text, status, is_active, is_default, notes, last_connected_at
      ) VALUES (
        $1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), 'qr', NULLIF($6, ''), 'connected', TRUE, $7, NULL, $8
      )
      RETURNING id, display_name, zalo_user_id, zalo_name, zalo_phone, login_method, status, is_active, is_default, notes, updated_at, last_connected_at`,
      [userId, displayName, zaloUserId, zaloName, zaloPhone, cookieText, isDefault, now]
    );
    return rows[0] || null;
  }

  async findAccountsList(isAdmin, userId) {
    const { rows } = await db.query(
      `SELECT zs.id_user, zs.id, zs.display_name, zs.zalo_user_id, zs.zalo_name, zs.zalo_phone,
              zs.login_method, zs.status, zs.is_active, zs.is_default, zs.notes,
              zs.updated_at::timestamptz AS updated_at, zs.last_connected_at::timestamptz AS last_connected_at,
              COALESCE(u.full_name, u.username) AS creator_name
       FROM zalo_settings zs
       LEFT JOIN users u ON zs.id_user = u.id
       WHERE 1 = 1
         ${isAdmin ? '' : 'AND zs.id_user = $1'}
       ORDER BY zs.is_default DESC, zs.created_at DESC`,
      isAdmin ? [] : [userId]
    );
    return rows;
  }

  async deleteAccount(accountId, isAdmin, userId) {
    const { rows } = await db.query(
      `DELETE FROM zalo_settings
       WHERE id = $1
         ${isAdmin ? '' : 'AND id_user = $2'}
       RETURNING id, id_user, is_default`,
      isAdmin ? [accountId] : [accountId, userId]
    );
    return rows[0] || null;
  }

  async promoteNextDefaultAccount(ownerUserId) {
    await db.query(
      `WITH first_row AS (
         SELECT id FROM zalo_settings
         WHERE id_user = $1
         ORDER BY created_at ASC
         LIMIT 1
       )
       UPDATE zalo_settings
       SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (SELECT id FROM first_row)`,
      [ownerUserId]
    );
  }

  async findAccountForRestore(accountId, isAdmin, userId) {
    const { rows } = await db.query(
      `SELECT id, id_user, display_name, cookie_text, is_active
       FROM zalo_settings
       WHERE id = $1
         ${isAdmin ? '' : 'AND id_user = $2'}
       LIMIT 1`,
      isAdmin ? [accountId] : [accountId, userId]
    );
    return rows[0] || null;
  }
}

export default new ZaloSettingRepository();
