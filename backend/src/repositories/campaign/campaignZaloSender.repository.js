import db from '../../config/database.js';
import { decryptZaloCookieRow, decryptZaloCookieRows, encryptZaloCookie } from '../../utils/zaloCookieCrypto.util.js';

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
    return decryptZaloCookieRow(result.rows[0] || null);
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
           restore_fail_count = 0,
           first_restore_fail_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND id_user = $5`,
      [displayName, encryptZaloCookie(cookieText), now, accountId, userId]
    );
  }

  /**
   * Record a failed auto-restore attempt. After ≥5 fails spanning ≥60 minutes,
   * move the account to needs_reauth so keep-alive / cron stop hammering it.
   *
   * @param {number|string} accountId
   * @returns {Promise<{ status: string, restore_fail_count: number }|null>}
   */
  async recordRestoreFailure(accountId) {
    const id = Number.parseInt(accountId, 10);
    if (!Number.isFinite(id)) return null;
    const { rows } = await db.query(
      `UPDATE zalo_settings
       SET restore_fail_count = restore_fail_count + 1,
           first_restore_fail_at = COALESCE(first_restore_fail_at, CURRENT_TIMESTAMP),
           last_restore_attempt_at = CURRENT_TIMESTAMP,
           status = CASE
             WHEN (restore_fail_count + 1) >= 5
               AND COALESCE(first_restore_fail_at, CURRENT_TIMESTAMP)
                   <= CURRENT_TIMESTAMP - INTERVAL '60 minutes'
             THEN 'needs_reauth'
             ELSE status
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING status, restore_fail_count, first_restore_fail_at, last_restore_attempt_at`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Manual retry: clear fail window and re-queue for keep-alive / cron restore.
   *
   * @param {number|string} accountId
   * @param {{ userId?: number|null, isAdmin?: boolean }} [scope]
   * @returns {Promise<object|null>}
   */
  async resetRestoreForRetry(accountId, { userId = null, isAdmin = false } = {}) {
    const id = Number.parseInt(accountId, 10);
    if (!Number.isFinite(id)) return null;
    const params = [id];
    let ownerClause = '';
    if (!isAdmin) {
      const uid = Number.parseInt(userId, 10);
      if (!Number.isFinite(uid)) return null;
      params.push(uid);
      ownerClause = ' AND id_user = $2';
    }
    const { rows } = await db.query(
      `UPDATE zalo_settings
       SET status = 'connected',
           restore_fail_count = 0,
           first_restore_fail_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1${ownerClause}
       RETURNING id, id_user, status, restore_fail_count, first_restore_fail_at,
                 last_restore_attempt_at, display_name, is_active`,
      params
    );
    return rows[0] || null;
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
   * Mark a single account as disconnected when user scope is not available.
   *
   * @param {number|string} accountId
   * @returns {Promise<void>}
   */
  async markAccountDisconnectedById(accountId) {
    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [accountId]
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
    const row = decryptZaloCookieRow(result.rows[0] || null);
    if (!row) return null;
    const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
    if (await resourceIsLocked('zalo_accounts', row.id)) return null;
    return row;
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

  /**
   * Find all connected Zalo accounts that need session restoration.
   * Returns accounts where status='connected' but may not have active memory session.
   *
   * @returns {Promise<{rows: Array}>}
   */
  async findConnectedAccountsNeedingRestore() {
    const result = await db.query(
      `SELECT id, id_user, display_name, status, is_active, cookie_text
       FROM zalo_settings
       WHERE status = 'connected'
         AND is_active = TRUE
         AND cookie_text IS NOT NULL
         AND cookie_text <> ''`
    );
    decryptZaloCookieRows(result.rows);
    return result;
  }
}

export default new CampaignZaloSenderRepository();
