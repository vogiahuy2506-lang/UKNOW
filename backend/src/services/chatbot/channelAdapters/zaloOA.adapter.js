import axios from 'axios';
import db from '../../../config/database.js';

const ZALO_OA_API_BASE = 'https://openapi.zalo.me/v3.0';

class ZaloOAAdapter {
  /**
   * Send a reply message to a Zalo OA user.
   * Uses credentials from database based on channel ID.
   * @param {object} params
   * @param {string} params.conversationId - internal conversation ID
   * @param {string} params.message - text reply
   * @param {number} params.userId
   * @param {number} params.channelId - channel_connections.id
   * @param {string} params.externalId - Zalo user openid
   */
  async sendReply({ conversationId, message, userId, channelId, externalId }) {
    try {
      // Get credentials from database
      let accessToken;
      if (channelId) {
        const { rows } = await db.query(
          `SELECT credentials->>'access_token' as access_token FROM channel_connections WHERE id = $1`,
          [channelId]
        );
        accessToken = rows[0]?.access_token;
      }

      if (!accessToken) {
        throw new Error('Zalo OA channel not found or missing access token');
      }

      // Send text message
      await axios.post(
        `${ZALO_OA_API_BASE}/oa/message/cs`,
        {
          recipient: { openid: externalId },
          message: {
            text: message.slice(0, 4000),
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            access_token: accessToken,
          },
          timeout: 10000,
        }
      );

      console.log(`[ZaloOA] Sent reply to user ${externalId}`);
      return { success: true };
    } catch (err) {
      console.error('[ZaloOA] Failed to send reply:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Verify Zalo OA webhook.
   * @param {string} verifyToken
   * @param {string} customVerifyToken - verify token from channel credentials
   * @returns {object} { challenge: string }
   */
  verifyWebhook(verifyToken, customVerifyToken = null) {
    const expectedToken = customVerifyToken || process.env.ZALO_OA_VERIFY_TOKEN || 'uknow_zalo_oa_verify';
    if (verifyToken !== expectedToken) {
      throw new Error('Invalid verify token');
    }
    return { challenge: 'uknow_zalo_oa_verified' };
  }

  /**
   * Parse incoming Zalo OA webhook event.
   * @param {object} body
   * @returns {object} parsed message data
   */
  parseWebhookEvent(body) {
    const event = body?.event_name;

    if (event === 'sendmsg' || event === 'user_send_text') {
      const message = body?.message?.text || '';
      const senderId = body?.sender?.id || body?.user_id_byoa || '';
      return {
        event,
        message,
        senderId,
        messageId: body?.message_id || '',
        timestamp: body?.timestamp ? new Date(body.timestamp * 1000) : new Date(),
      };
    }

    // Unsupported event type
    return { event, message: null, senderId: null };
  }

  /**
   * Get long-lived access token info.
   */
  async getAccessTokenInfo(accessToken) {
    try {
      const resp = await axios.get(`${ZALO_OA_API_BASE}/oa/getprofile`, {
        params: { access_token: accessToken },
        timeout: 10000,
      });
      return resp.data;
    } catch {
      return null;
    }
  }

  /**
   * Exchange short-lived code for long-lived access token.
   * @param {string} code
   * @param {string} appId
   * @param {string} appSecret
   */
  async exchangeAccessToken(code, appId, appSecret) {
    if (!appId || !appSecret) {
      throw new Error('Zalo OA credentials not configured');
    }

    const resp = await axios.get('https://oauth.zaloapp.com/v4/access_token', {
      params: { code, app_id: appId, app_secret: appSecret },
      timeout: 10000,
    });

    return resp.data;
  }
}

export default new ZaloOAAdapter();
