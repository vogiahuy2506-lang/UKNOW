import db from '../../config/database.js';

class CampaignZaloSenderRepository {
  /**
   * Load account cookie source for auto-restore.
   *
   * @param {number} accountId
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findAccountRestoreSource(accountId, userId) {
    const result = await db.query(
      `SELECT id, display_name, status, is_active, cookie_text
       FROM zalo_settings
       WHERE id = $1 AND id_user = $2
       LIMIT 1`,
      [accountId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark account as connected and update cookie_text + last_connected_at.
   *
   * @param {object} params
   * @param {number} params.accountId
   * @param {number} params.userId
   * @param {string} params.displayName
   * @param {string} params.cookieText
   * @param {Date} params.now
   * @returns {Promise<void>}
   */
  async markAccountConnected({ accountId, userId, displayName, cookieText, now }) {
    await db.query(
      `UPDATE zalo_settings
       SET status = 'connected',
           is_active = TRUE,
           display_name = COALESCE(NULLIF($1, ''), display_name),
           cookie_text = COALESCE(NULLIF($2, ''), cookie_text),
           last_connected_at = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND id_user = $5`,
      [displayName, cookieText, now, accountId, userId]
    );
  }

  /**
   * Mark a single account as disconnected.
   *
   * @param {number} accountId
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async markAccountDisconnected(accountId, userId) {
    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND id_user = $2`,
      [accountId, userId]
    );
  }

  /**
   * Load one Zalo account row for campaign usage.
   * Admin users can load any account; non-admin users are restricted to their own.
   *
   * @param {number} accountId
   * @param {number|null} userId  null when isAdmin = true
   * @param {boolean} isAdmin
   * @returns {Promise<object|null>}
   */
  async findCampaignZaloAccount(accountId, userId, isAdmin) {
    const result = await db.query(
      `SELECT id, id_user, display_name, status, is_active, is_default, cookie_text,
              zalo_personal_outbound_per_hour_limit,
              zalo_personal_outbound_delay_min_ms,
              zalo_personal_outbound_delay_max_ms
       FROM zalo_settings
       WHERE id = $1
         ${isAdmin ? '' : 'AND id_user = $2'}
       LIMIT 1`,
      isAdmin ? [accountId] : [accountId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Bulk-mark a list of accounts as disconnected for one user.
   *
   * @param {number} userId
   * @param {number[]} accountIds
   * @returns {Promise<void>}
   */
  async bulkMarkAccountsDisconnected(userId, accountIds) {
    if (!accountIds.length) return;
    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $1
         AND id = ANY($2::bigint[])`,
      [userId, accountIds]
    );
  }
}

export default new CampaignZaloSenderRepository();
