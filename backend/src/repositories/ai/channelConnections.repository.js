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
}

export default new ChannelConnectionsRepository();
