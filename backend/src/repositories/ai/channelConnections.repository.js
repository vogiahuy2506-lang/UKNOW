import db from '../../config/database.js';

/**
 * ChannelConnections repository — handles per-user channel accounts.
 * Mirrors WhatsApp's pattern: each user owns one or more channels (pages,
 * sessions) under channel_connections, and per-chatbot enable state lives
 * on chatbot_channel_connections.
 *
 * Migration 231 widens the UNIQUE constraint to (id_user, channel, fb_page_id)
 * so a single user can connect multiple Facebook Pages.
 */
class ChannelConnectionsRepository {
  /**
   * List all active Facebook Page connections for a user.
   * Credentials are returned as-is — controllers are responsible for stripping
   * page_access_token before exposing to clients.
   * @param {number} userId
   * @returns {Promise<Array<object>>}
   */
  async listFacebookConnections(userId) {
    const { rows } = await db.query(
      `SELECT cc.id, cc.id_user, cc.channel, cc.display_name, cc.fb_user_id, cc.fb_page_id,
              cc.fb_page_name, cc.external_channel_id, cc.webhook_url, cc.credentials,
              cc.settings, cc.is_active, cc.created_at, cc.updated_at,
              ft.token_expires_at, ft.is_valid as token_is_valid
       FROM channel_connections cc
       LEFT JOIN facebook_token_tracking ft ON ft.channel_connection_id = cc.id
       WHERE cc.id_user = $1 AND cc.channel = 'facebook' AND cc.is_active = true
       ORDER BY cc.created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Upsert a Facebook Page connection for a user. On conflict updates the
   * page name, credentials, fb_user_id (first-write-wins for user id), and
   * is_active flag.
   *
   * @param {number} userId
   * @param {object} params
   * @param {string} params.pageId
   * @param {string} params.pageName
   * @param {string} params.pageAccessToken
   * @param {string|null} params.fbUserId
   * @returns {Promise<object>}
   */
  async upsertFacebookConnection(userId, { pageId, pageName, pageAccessToken, fbUserId }) {
    const { rows } = await db.query(
      `INSERT INTO channel_connections
         (id_user, channel, fb_user_id, fb_page_id, fb_page_name,
          external_channel_id, credentials, is_active, display_name)
       VALUES ($1, 'facebook', $2, $3, $4, $3, $5, true, $4)
       ON CONFLICT ON CONSTRAINT uq_channel_user_channel_fb_page DO UPDATE SET
         fb_page_name = EXCLUDED.fb_page_name,
         display_name = EXCLUDED.display_name,
         credentials = EXCLUDED.credentials,
         -- First-write-wins for fb_user_id — the same FB user usually owns all pages.
         fb_user_id = COALESCE(channel_connections.fb_user_id, EXCLUDED.fb_user_id),
         external_channel_id = EXCLUDED.external_channel_id,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        fbUserId || null,
        pageId,
        pageName,
        JSON.stringify({ page_access_token: pageAccessToken }),
      ]
    );
    return rows[0];
  }

  /**
   * Look up a specific Facebook connection by page id.
   * @param {number} userId
   * @param {string} pageId
   * @returns {Promise<object|null>}
   */
  async getFacebookConnectionByPageId(userId, pageId) {
    const { rows } = await db.query(
      `SELECT * FROM channel_connections
       WHERE id_user = $1 AND channel = 'facebook'
         AND fb_page_id = $2 AND is_active = true`,
      [userId, pageId]
    );
    return rows[0] || null;
  }

  /**
   * Look up a Facebook connection by its primary key. Verifies owner for
   * authorization purposes.
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getFacebookConnectionById(id, userId) {
    const { rows } = await db.query(
      `SELECT * FROM channel_connections
       WHERE id = $1 AND id_user = $2 AND channel = 'facebook'`,
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * Soft-delete (deactivate) a Facebook connection.
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>} true if a row was updated
   */
  async deleteFacebookConnection(id, userId) {
    const { rows } = await db.query(
      `UPDATE channel_connections
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND id_user = $2 AND channel = 'facebook'
       RETURNING id`,
      [id, userId]
    );
    return rows.length > 0;
  }

  /**
   * Replace the page_access_token on a connection — used after refreshing
   * a long-lived token via Meta Graph API.
   * @param {number} id
   * @param {string} newToken
   */
  async refreshFacebookPageToken(id, newToken) {
    await db.query(
      `UPDATE channel_connections
       SET credentials = jsonb_set(
             COALESCE(credentials, '{}'::jsonb),
             '{page_access_token}',
             to_jsonb($2::text),
             true
           ),
           updated_at = NOW()
       WHERE id = $1 AND channel = 'facebook'`,
      [id, newToken]
    );
  }

  /**
   * Extract just the page_access_token from a connection. Helper for the
   * webhook/send path — never returns the whole credentials blob.
   * @param {number} id
   * @returns {Promise<string|null>}
   */
  async getFacebookPageToken(id) {
    const { rows } = await db.query(
      `SELECT credentials->>'page_access_token' AS token
       FROM channel_connections
       WHERE id = $1 AND channel = 'facebook' AND is_active = true`,
      [id]
    );
    return rows[0]?.token ?? null;
  }

  /**
   * Session key Baileys (`<userId>-<shortKey>`) của một dòng channel_connections
   * WhatsApp QR. Hộp thư chỉ có `channel_conversations.id_channel` (số) — phải tra
   * ra session key mới gửi được. Ràng buộc id_user để không gửi nhầm qua phiên người khác.
   * @param {number|string} id - channel_connections.id
   * @param {number} userId
   * @returns {Promise<string|null>}
   */
  async getBaileysSessionKey(id, userId) {
    const { rows } = await db.query(
      `SELECT external_channel_id
       FROM channel_connections
       WHERE id = $1 AND id_user = $2 AND channel = 'whatsapp_baileys'`,
      [id, userId]
    );
    return rows[0]?.external_channel_id ?? null;
  }

  /**
   * `telegram_accounts.id` của một dòng channel_connections Telegram (`external_channel_id = String(account.id)`).
   * Hộp thư chỉ có `channel_conversations.id_channel` (số) — phải tra ra tài khoản mới gửi được.
   * Ràng buộc id_user để không gửi nhầm qua tài khoản người khác.
   * @param {number|string} id - channel_connections.id
   * @param {number} userId
   * @returns {Promise<number|null>}
   */
  async getTelegramAccountId(id, userId) {
    const { rows } = await db.query(
      `SELECT external_channel_id
       FROM channel_connections
       WHERE id = $1 AND id_user = $2 AND channel = 'telegram'`,
      [id, userId]
    );
    const accountId = Number(rows[0]?.external_channel_id);
    return Number.isFinite(accountId) ? accountId : null;
  }

  // ─── Zalo OA Connections ──────────────────────────────────────────────────

  /**
   * List all active Zalo OA connections for a user/workspace.
   * @param {number} userId
   * @returns {Promise<Array<object>>}
   */
  async listZaloOaConnections(userId) {
    const { rows } = await db.query(
      `SELECT cc.id, cc.id_user, cc.channel, cc.display_name, cc.zalo_oa_id,
              cc.zalo_oa_name, cc.zalo_oa_avatar, cc.external_channel_id,
              cc.webhook_url, cc.credentials, cc.settings, cc.is_active,
              cc.created_at, cc.updated_at
       FROM channel_connections cc
       WHERE cc.id_user = $1 AND cc.channel = 'zalo_oa' AND cc.is_active = true
       ORDER BY cc.created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Upsert a Zalo OA connection for a user.
   */
  async upsertZaloOaConnection(userId, {
    oaId,
    oaName,
    oaAvatar,
    appId,
    appSecret,
    oaSecretKey,
    accessToken,
    refreshToken,
    expiresAt,
    refreshTokenExpiresAt,
  }) {
    const credentials = {
      app_id: appId,
      app_secret: appSecret,
      oa_secret_key: oaSecretKey,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
    };
    const { rows } = await db.query(
      `INSERT INTO channel_connections
         (id_user, channel, zalo_oa_id, zalo_oa_name, zalo_oa_avatar,
          external_channel_id, credentials, is_active, display_name)
       VALUES ($1, 'zalo_oa', $2, $3, $4, $2, $5, true, $3)
       ON CONFLICT ON CONSTRAINT uq_channel_user_zalo_oa DO UPDATE SET
         zalo_oa_name = EXCLUDED.zalo_oa_name,
         zalo_oa_avatar = COALESCE(EXCLUDED.zalo_oa_avatar, channel_connections.zalo_oa_avatar),
         display_name = EXCLUDED.display_name,
         credentials = EXCLUDED.credentials,
         external_channel_id = EXCLUDED.external_channel_id,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [userId, oaId, oaName || 'Zalo OA', oaAvatar || null, JSON.stringify(credentials)]
    );
    return rows[0];
  }

  /**
   * Look up a Zalo OA connection by OA ID (or external_channel_id).
   * @param {number} userId
   * @param {string} oaId
   * @returns {Promise<object|null>}
   */
  async getZaloOaConnectionByOaId(userId, oaId) {
    const { rows } = await db.query(
      `SELECT * FROM channel_connections
       WHERE id_user = $1 AND channel = 'zalo_oa'
         AND (zalo_oa_id = $2 OR external_channel_id = $2) AND is_active = true`,
      [userId, String(oaId)]
    );
    return rows[0] || null;
  }

  /**
   * Look up a Zalo OA connection by its primary key.
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async getZaloOaConnectionById(id, userId) {
    const { rows } = await db.query(
      `SELECT * FROM channel_connections
       WHERE id = $1 AND id_user = $2 AND channel = 'zalo_oa'`,
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * Soft-delete (deactivate) a Zalo OA connection.
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deleteZaloOaConnection(id, userId) {
    const { rowCount } = await db.query(
      `UPDATE channel_connections
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND id_user = $2 AND channel = 'zalo_oa'`,
      [id, userId]
    );
    return rowCount > 0;
  }

  /**
   * Find Zalo OA connections whose access_token is expiring soon.
   * @param {number} [thresholdHours=6]
   * @returns {Promise<Array<object>>}
   */
  async findExpiringZaloOaConnections(thresholdHours = 6) {
    const { rows } = await db.query(
      `SELECT id, id_user, display_name, zalo_oa_id, external_channel_id, credentials
       FROM channel_connections
       WHERE channel = 'zalo_oa' AND is_active = true
         AND credentials->>'refresh_token' IS NOT NULL
         AND (
           credentials->>'expires_at' IS NULL
           OR (credentials->>'expires_at')::timestamptz <= NOW() + ($1 || ' hours')::interval
         )`,
      [thresholdHours]
    );
    return rows;
  }

  /**
   * Update credentials for a Zalo OA connection.
   * @param {number} id
   * @param {object} credentials
   * @returns {Promise<object|null>}
   */
  async updateZaloOaCredentials(id, credentials) {
    const { rows } = await db.query(
      `UPDATE channel_connections
       SET credentials = $2, updated_at = NOW()
       WHERE id = $1 AND channel = 'zalo_oa'
       RETURNING *`,
      [id, JSON.stringify(credentials)]
    );
    const updated = rows[0] || null;
    if (updated?.zalo_oa_id) {
      await db.query(
        `UPDATE chatbot_channel_connections
         SET credentials = $2, updated_at = NOW()
         WHERE channel_type = 'zalo_oa' AND external_channel_id = $1`,
        [updated.zalo_oa_id, JSON.stringify(credentials)]
      );
    }
    return updated;
  }
}

export default new ChannelConnectionsRepository();
