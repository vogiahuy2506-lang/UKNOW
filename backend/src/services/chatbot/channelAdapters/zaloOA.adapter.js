import axios from 'axios';
import crypto from 'crypto';
import chatbotChannelRepository from '../../../repositories/ai/chatbotChannel.repository.js';
import {
  ZALO_OA_VERIFY_TOKEN_ENV_NAMES,
  resolveWebhookVerifyToken,
  timingSafeStringEqual,
} from '../../../utils/webhookVerification.util.js';

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
        accessToken = await chatbotChannelRepository.getChatbotChannelAccessToken(channelId);
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
   * Token hợp lệ: token riêng của kênh → ZALO_OA_WEBHOOK_VERIFY_TOKEN → ZALO_OA_VERIFY_TOKEN.
   * Không có token nào thì luôn từ chối.
   * @param {string} verifyToken
   * @param {string} customVerifyToken - verify token from channel credentials
   * @returns {object} { challenge: string }
   */
  verifyWebhook(verifyToken, customVerifyToken = null) {
    const expectedToken = resolveWebhookVerifyToken({
      channelToken: customVerifyToken,
      envNames: ZALO_OA_VERIFY_TOKEN_ENV_NAMES,
    });
    if (!expectedToken || !timingSafeStringEqual(verifyToken, expectedToken)) {
      throw new Error('Invalid verify token');
    }
    return { challenge: 'uknow_zalo_oa_verified' };
  }

  /**
   * Kiểm chữ ký header `X-ZEvent-Signature` Zalo gắn vào webhook OA:
   * `mac=<hex SHA-256(appId + rawBody + timestamp + oaSecretKey)>` — SHA-256 thường trên chuỗi nối,
   * không phải HMAC. `appId` và `timestamp` lấy từ chính payload (trường `app_id`, `timestamp`),
   * `oaSecretKey` là "OA Secret Key" ở mục Webhook của app trên Zalo Developers (KHÁC App Secret).
   * Chấp nhận khi khớp MỘT trong các khoá truyền vào (so khớp hằng thời gian).
   *
   * @param {object} params
   * @param {Buffer|string} params.rawBody thân request nguyên bản (`req.rawBody`)
   * @param {string} params.signatureHeader giá trị header `x-zevent-signature`
   * @param {string|number} params.appId
   * @param {string|number} params.timestamp
   * @param {string|string[]} params.oaSecretKeys
   * @returns {boolean}
   */
  verifySignature({ rawBody, signatureHeader, appId, timestamp, oaSecretKeys }) {
    const keys = (Array.isArray(oaSecretKeys) ? oaSecretKeys : [oaSecretKeys])
      .filter((key) => typeof key === 'string' && key.length > 0);
    if (!rawBody || typeof signatureHeader !== 'string' || keys.length === 0) return false;
    if (appId === undefined || appId === null || appId === '') return false;
    if (timestamp === undefined || timestamp === null || timestamp === '') return false;
    const match = /^\s*mac\s*=\s*([0-9a-f]{64})\s*$/i.exec(signatureHeader);
    if (!match) return false;
    const provided = Buffer.from(match[1], 'hex');
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
    let matched = false;
    for (const key of keys) {
      const computed = crypto
        .createHash('sha256')
        .update(String(appId), 'utf8')
        .update(body)
        .update(String(timestamp), 'utf8')
        .update(key, 'utf8')
        .digest();
      // Không dừng sớm khi khớp: thời gian không phụ thuộc khoá nào khớp.
      if (crypto.timingSafeEqual(provided, computed)) matched = true;
    }
    return matched;
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
