/**
 * Facebook Token Auto-Refresh Service
 * 
 * Meta Facebook Page Access Tokens expire after ~60 days.
 * This service automatically refreshes tokens before they expire.
 * 
 * Cron job runs daily and refreshes tokens that expire within 7 days.
 */

import db from '../../config/database.js';
import channelConnectionsRepository from '../../repositories/ai/channelConnections.repository.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

/**
 * Cascade a fresh page_access_token to chatbot_channel_connections rows
 * so webhooks and outbound sends pick up the new token immediately.
 * @param {number} userId
 * @param {string} pageId
 * @param {string} newToken
 */
async function cascadeTokenToChatbotChannels(userId, pageId, newToken) {
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

/**
 * Exchange a short-lived or expired token for a fresh long-lived token.
 * Per Meta docs: GET /oauth/access_token?grant_type=fb_exchange_token&...
 * 
 * @param {string} currentToken - Current (possibly expired) access token
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}|null>}
 */
export async function exchangeForLongLivedToken(currentToken) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  
  if (!appId || !appSecret) {
    console.warn('[FacebookTokenRefresh] Missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET');
    return null;
  }

  try {
    const url = `${FB_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token`
      + `&client_id=${encodeURIComponent(appId)}`
      + `&client_secret=${encodeURIComponent(appSecret)}`
      + `&fb_exchange_token=${encodeURIComponent(currentToken)}`;
    
    const resp = await fetch(url);
    const data = await resp.json();
    
    if (data.error) {
      console.error('[FacebookTokenRefresh] Token exchange error:', data.error.message);
      return null;
    }
    
    return data;
  } catch (err) {
    console.error('[FacebookTokenRefresh] Token exchange failed:', err.message);
    return null;
  }
}

/**
 * Refresh all Facebook Page tokens for users whose tokens expire within the warning window.
 * Called by the scheduler cron job.
 * 
 * @param {object} options
 * @param {number} options.expiryWarningDays - Refresh tokens expiring within this many days (default: 7)
 * @returns {Promise<{total: number, refreshed: number, failed: number, errors: string[]}>}
 */
export async function refreshExpiringTokens({ expiryWarningDays = 7 } = {}) {
  // Get all active Facebook connections with their tokens, ordered by expiry
  // Prioritize tokens that are about to expire
  const { rows: connections } = await db.query(
    `SELECT cc.id, cc.id_user, cc.fb_page_id, cc.fb_page_name, cc.credentials,
            u.email as user_email, u.full_name as user_name,
            ft.token_expires_at
     FROM channel_connections cc
     JOIN users u ON u.id = cc.id_user
     LEFT JOIN facebook_token_tracking ft ON ft.channel_connection_id = cc.id
     WHERE cc.channel = 'facebook'
       AND cc.is_active = true
       AND cc.credentials->>'page_access_token' IS NOT NULL
       -- Refresh if no tracking record OR token expires within warning window
       AND (
         ft.token_expires_at IS NULL
         OR ft.token_expires_at < NOW() + ($1 || ' days')::interval
         OR ft.token_expires_at < NOW() + INTERVAL '7 days'
       )
     ORDER BY COALESCE(ft.token_expires_at, NOW() + INTERVAL '55 days') ASC`,
    [expiryWarningDays]
  );

  const result = {
    total: connections.length,
    refreshed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Track which user's tokens we've processed to avoid duplicate work
  const processedUsers = new Set();

  for (const conn of connections) {
    const currentToken = conn.credentials?.page_access_token;
    if (!currentToken) {
      result.skipped += 1;
      continue;
    }

    try {
      // Exchange for a fresh long-lived token
      const freshTokenData = await exchangeForLongLivedToken(currentToken);
      
      if (!freshTokenData || !freshTokenData.access_token) {
        result.failed += 1;
        result.errors.push(`conn=${conn.id} page=${conn.fb_page_id}: no token returned`);
        continue;
      }

      // Update the token in channel_connections
      await channelConnectionsRepository.refreshFacebookPageToken(conn.id, freshTokenData.access_token);

      // Also cascade to chatbot_channel_connections for webhooks/sends
      await cascadeTokenToChatbotChannels(conn.id_user, conn.fb_page_id, freshTokenData.access_token);

      result.refreshed += 1;
      console.log(
        `[FacebookTokenRefresh] Refreshed token for conn=${conn.id} ` +
        `page=${conn.fb_page_name || conn.fb_page_id} ` +
        `user=${conn.user_name || conn.user_email}`
      );
    } catch (err) {
      result.failed += 1;
      result.errors.push(`conn=${conn.id} page=${conn.fb_page_id}: ${err.message}`);
      console.error(`[FacebookTokenRefresh] Failed to refresh conn ${conn.id}:`, err.message);
    }
  }

  return result;
}

/**
 * Get token expiry info for a connection (checks via Meta API).
 * Note: Meta doesn't expose expiry directly for long-lived tokens via basic API.
 * We track it manually or assume ~60 days from creation.
 * 
 * @param {string} pageAccessToken
 * @returns {Promise<{is_valid: boolean, expires_in?: number, error?: string}>}
 */
export async function getTokenInfo(pageAccessToken) {
  try {
    const url = `${FB_GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(pageAccessToken)}`;
    // Use app-level token for debugging
    const appToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;
    const resp = await fetch(`${url}&access_token=${encodeURIComponent(appToken)}`);
    const data = await resp.json();
    
    if (data.error) {
      return { is_valid: false, error: data.error.message };
    }

    const tokenData = data.data || data;
    return {
      is_valid: tokenData.is_valid !== false,
      expires_in: tokenData.expires_at ? tokenData.expires_at - Math.floor(Date.now() / 1000) : null,
      error: tokenData.error?.message,
    };
  } catch (err) {
    return { is_valid: false, error: err.message };
  }
}
