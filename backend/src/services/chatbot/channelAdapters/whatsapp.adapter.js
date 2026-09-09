import axios from 'axios';
import crypto from 'crypto';
import chatbotChannelRepository from '../../../repositories/ai/chatbotChannel.repository.js';
import { sendMessage as baileysSendMessage } from '../whatsappBaileys.service.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

class WhatsAppAdapter {
  /**
   * Send a free-form text reply.
   *
   * Hai provider được hỗ trợ:
   *   - Cloud API (Meta OAuth) — khi `channelId` là số nguyên tồn tại trong
   *     `chatbot_channel_connections` với `channel_type='whatsapp'`.
   *   - Baileys (QR scan) — khi `channelId` là chuỗi session_key
   *     ("${userId}-${shortKey}"), tức là kênh WhatsApp cá nhân đăng nhập
   *     qua QR, không cần Meta App / Business verification.
   *
   * @param {object} params
   * @param {number|string} params.channelId - Cloud API id HOẶC Baileys session_key
   * @param {string} params.externalId - WhatsApp sender (E.164 không có '+')
   * @param {string} params.message - text reply (<= 4096 chars)
   * @returns {Promise<{success: boolean, error?: string, messageId?: string, provider?: string}>}
   */
  async sendReply({ channelId, externalId, message }) {
    // ── Baileys path ──────────────────────────────────────────────
    if (typeof channelId === 'string' && /^\d+-[A-Za-z0-9_-]+$/.test(channelId)) {
      try {
        const result = await baileysSendMessage(channelId, externalId, String(message || '').slice(0, 4096));
        const messageId = result?.key?.id || null;
        console.log(`[WhatsApp/Baileys] Sent reply to ${externalId} via session ${channelId} (msg ${messageId})`);
        return { success: true, messageId, provider: 'baileys' };
      } catch (err) {
        console.error('[WhatsApp/Baileys] Failed to send reply:', err.message);
        return { success: false, error: err.message, provider: 'baileys' };
      }
    }

    // ── Cloud API path ────────────────────────────────────────────
    try {
      const accessToken = await chatbotChannelRepository.getChatbotChannelAccessToken(channelId);
      if (!accessToken) {
        throw new Error('WhatsApp channel missing access token');
      }

      // Resolve phone_number_id. We need the connection row to know which
      // WhatsApp number to call.
      const channel = await chatbotChannelRepository.findActiveChannelById(channelId);
      const phoneNumberId = channel?.phone_number_id;
      if (!phoneNumberId) {
        throw new Error('WhatsApp channel missing phone_number_id');
      }

      const response = await axios.post(
        `${FB_GRAPH_BASE}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: externalId,
          type: 'text',
          text: { body: String(message || '').slice(0, 4096) },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const messageId = response.data?.messages?.[0]?.id || null;
      console.log(`[WhatsApp/CloudAPI] Sent reply to ${externalId} via phone ${phoneNumberId} (msg ${messageId})`);
      return { success: true, messageId, provider: 'cloud_api' };
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      console.error('[WhatsApp/CloudAPI] Failed to send reply:', detail);
      return { success: false, error: detail, provider: 'cloud_api' };
    }
  }

  /**
   * Verify the Meta webhook challenge request.
   *
   * @param {object} query - req.query from the GET verification request
   * @param {string} customVerifyToken - per-channel verify_token stored in credentials
   * @returns {{challenge: string}|null}
   */
  verifyWebhook(query, customVerifyToken) {
    const mode = query?.['hub.mode'];
    const token = query?.['hub.verify_token'];
    const challenge = query?.['hub.challenge'];
    const expected = customVerifyToken || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && token && token === expected && challenge) {
      return { challenge: String(challenge) };
    }
    return null;
  }

  /**
   * Verify the X-Hub-Signature-256 header from Meta using constant-time compare.
   *
   * @param {Buffer|string} rawBody - the unparsed request body
   * @param {string} signatureHeader - value of req.headers['x-hub-signature-256']
   * @param {string} appSecret - Meta App Secret used to sign
   * @returns {boolean}
   */
  verifySignature(rawBody, signatureHeader, appSecret) {
    if (!rawBody || !signatureHeader || !appSecret) return false;
    const expectedPrefix = 'sha256=';
    if (!signatureHeader.startsWith(expectedPrefix)) return false;
    const provided = signatureHeader.slice(expectedPrefix.length);
    const computed = crypto
      .createHmac('sha256', appSecret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(provided, 'hex'),
        Buffer.from(computed, 'hex')
      );
    } catch (_err) {
      return false;
    }
  }

  /**
   * Parse a WhatsApp webhook event into individual inbound messages.
   * WhatsApp batches multiple messages per webhook (unlike Zalo OA's
   * single-message shape and Facebook's `entry[].messaging[]` array).
   *
   * @param {object} body - parsed webhook payload
   * @returns {Array<{senderId:string, message:string, messageId:string, timestamp:Date, profileName?:string}>}
   */
  parseWebhookEvent(body) {
    const out = [];
    if (!body || body.object !== 'whatsapp_business_account') return out;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change?.value;
        if (!value || !Array.isArray(value.messages)) continue;
        for (const msg of value.messages) {
          if (msg.type !== 'text' || !msg.text?.body) continue;
          out.push({
            senderId: msg.from,
            message: msg.text.body,
            messageId: msg.id,
            timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
            profileName: value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name,
          });
        }
      }
    }

    return out;
  }
}

export default new WhatsAppAdapter();
