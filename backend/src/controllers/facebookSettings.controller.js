import channelConnectionsRepository from '../repositories/ai/channelConnections.repository.js';
import chatbotChannelRepository from '../repositories/ai/chatbotChannel.repository.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Strip the page_access_token out of a connection row before sending to the
 * client. The token is sensitive and lives only in the credentials blob.
 */
function sanitize(connection) {
  if (!connection) return connection;
  const { credentials, ...rest } = connection;
  return {
    ...rest,
    has_credentials: Boolean(credentials && Object.keys(credentials).length > 0),
  };
}

/**
 * Exchange a long-lived Facebook user access token for a fresh long-lived
 * page access token. Used when the user clicks "Refresh token" in the UI.
 *
 * Per Meta docs:
 *   GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...
 *
 * @param {string} currentToken
 * @returns {Promise<string|null>} new token or null on failure
 */
async function refreshUserToken(currentToken) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return null;

  try {
    const url = `${FB_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token`
      + `&client_id=${encodeURIComponent(appId)}`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&fb_exchange_token=${encodeURIComponent(currentToken)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data?.access_token) return data.access_token;
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch fresh long-lived tokens for all pages belonging to a user token.
 * Meta gives us back the user token + the page list (each with its own
 * page access token).
 *
 * @param {string} userAccessToken
 * @returns {Promise<Array<{id, name, access_token}>>}
 */
async function fetchPagesWithFreshTokens(userAccessToken) {
  const url = `${FB_GRAPH_BASE}/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`;
  const resp = await fetch(url);
  const data = await resp.json();
  return Array.isArray(data?.data) ? data.data : [];
}

/**
 * Refresh page tokens for ALL Facebook connections owned by `userId`. After
 * successful refresh, also sync the matching tokens into chatbot_channel_connections
 * so webhooks and outbound sends pick up the new credentials.
 */
async function refreshAllFacebookPagesForUser(userId) {
  const conns = await channelConnectionsRepository.listFacebookConnections(userId);
  const results = [];

  for (const conn of conns) {
    const currentToken = conn.credentials?.page_access_token;
    if (!currentToken) {
      results.push({ id: conn.id, ok: false, reason: 'no_token' });
      continue;
    }

    const fresh = await refreshUserToken(currentToken);
    if (!fresh) {
      results.push({ id: conn.id, ok: false, reason: 'refresh_failed' });
      continue;
    }

    await channelConnectionsRepository.refreshFacebookPageToken(conn.id, fresh);
    // Cascade to chatbot_channel_connections for any chatbot this page is on.
    await cascadeTokenToChatbotChannels(userId, conn.fb_page_id, fresh);

    results.push({ id: conn.id, ok: true });
  }

  return results;
}

/**
 * Mirror a freshly refreshed page_access_token into chatbot_channel_connections
 * so per-chatbot webhooks and sends keep working without re-connecting.
 */
async function cascadeTokenToChatbotChannels(userId, pageId, newToken) {
  const { default: db } = await import('../config/database.js');
  await db.query(
    `UPDATE chatbot_channel_connections ccc
     SET credentials = jsonb_set(
           COALESCE(ccc.credentials, '{}'::jsonb),
           '{page_access_token}',
           to_jsonb($3::text),
           true
         ),
         updated_at = NOW()
     FROM custom_chatbots cc
     WHERE ccc.id_chatbot = cc.id
       AND cc.id_user = $1
       AND ccc.channel_type = 'facebook'
       AND ccc.external_channel_id = $2`,
    [userId, pageId, newToken]
  );
}

class FacebookSettingsController {
  /**
   * GET /api/settings/facebook-connections
   * List all Facebook Pages connected by the current user.
   */
  async listConnections(req, res) {
    try {
      const userId = req.user.id;
      const conns = await channelConnectionsRepository.listFacebookConnections(userId);
      return res.json({
        success: true,
        data: conns.map(sanitize),
      });
    } catch (err) {
      console.error('[FacebookSettings] listConnections error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/settings/facebook-connections/refresh-all
   * Bulk refresh all page tokens for the current user.
   */
  async refreshAllConnections(req, res) {
    try {
      const userId = req.user.id;
      const results = await refreshAllFacebookPagesForUser(userId);
      const failed = results.filter((r) => !r.ok).length;
      return res.json({
        success: true,
        data: { refreshed: results.length - failed, failed, results },
      });
    } catch (err) {
      console.error('[FacebookSettings] refreshAll error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/settings/facebook-connections/:id/refresh-token
   * Refresh a single page token.
   */
  async refreshConnection(req, res) {
    try {
      const userId = req.user.id;
      const id = parseInt(req.params.id, 10);
      const conn = await channelConnectionsRepository.getFacebookConnectionById(id, userId);
      if (!conn) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối Facebook.' });
      }
      const currentToken = conn.credentials?.page_access_token;
      if (!currentToken) {
        return res.status(400).json({ success: false, message: 'Kết nối này không có token.' });
      }
      const fresh = await refreshUserToken(currentToken);
      if (!fresh) {
        return res.status(502).json({ success: false, message: 'Facebook từ chối làm mới token.' });
      }
      await channelConnectionsRepository.refreshFacebookPageToken(id, fresh);
      await cascadeTokenToChatbotChannels(userId, conn.fb_page_id, fresh);
      return res.json({ success: true });
    } catch (err) {
      console.error('[FacebookSettings] refresh error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * DELETE /api/settings/facebook-connections/:id
   * Soft-delete a Facebook Page connection. Also cascade to any
   * chatbot_channel_connections that reference this page.
   */
  async deleteConnection(req, res) {
    try {
      const userId = req.user.id;
      const id = parseInt(req.params.id, 10);
      const conn = await channelConnectionsRepository.getFacebookConnectionById(id, userId);
      if (!conn) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy kết nối Facebook.' });
      }

      const deleted = await channelConnectionsRepository.deleteFacebookConnection(id, userId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Không thể ngắt kết nối.' });
      }

      // Cascade deactivate any chatbot that was using this page.
      const { default: db } = await import('../config/database.js');
      await db.query(
        `UPDATE chatbot_channel_connections ccc
         SET is_active = false, updated_at = NOW()
         FROM custom_chatbots cc
         WHERE ccc.id_chatbot = cc.id
           AND cc.id_user = $1
           AND ccc.channel_type = 'facebook'
           AND ccc.external_channel_id = $2`,
        [userId, conn.fb_page_id]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('[FacebookSettings] delete error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

export default new FacebookSettingsController();
