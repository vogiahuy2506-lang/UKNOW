import axios from 'axios';
import chatbotRepository from '../../../repositories/ai/chatbot.repository.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

class FacebookAdapter {
  /**
   * Send a reply via Facebook Messenger Send API.
   * @param {object} params
   * @param {string} params.externalId - Facebook PSID
   * @param {string} params.message - text reply
   * @param {number} params.userId
   */
  async sendReply({ externalId, message, userId }) {
    try {
      const channel = await chatbotRepository.findChannelByType(userId, 'facebook');
      const pageAccessToken = channel?.credentials?.page_access_token;

      if (!pageAccessToken) {
        throw new Error('Facebook Page access token not configured');
      }

      const pageId = channel?.credentials?.page_id;

      await axios.post(
        `${FB_GRAPH_BASE}/me/messages`,
        {
          recipient: { id: externalId },
          message: { text: message.slice(0, 2000) },
        },
        {
          params: { access_token: pageAccessToken },
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        }
      );

      console.log(`[Facebook] Sent reply to PSID ${externalId}`);
      return { success: true };
    } catch (err) {
      console.error('[Facebook] Failed to send reply:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Verify Facebook webhook.
   * @param {string} mode
   * @param {string} token
   * @param {string} challenge
   */
  verifyWebhook(mode, token, challenge) {
    const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || 'uknow_fb_verify';
    if (mode === 'subscribe' && token === verifyToken) {
      return { challenge };
    }
    throw new Error('Invalid Facebook verify token');
  }

  /**
   * Parse incoming Facebook Messenger webhook event.
   * @param {object} body
   * @returns {object[]} parsed messages
   */
  parseWebhookEvent(body) {
    const messages = [];

    if (body?.object !== 'page') return messages;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (event.message && event.message.text) {
          messages.push({
            senderId: event.sender?.id,
            recipientId: event.recipient?.id,
            message: event.message.text,
            messageId: event.message.mid,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            attachments: event.message.attachments || [],
          });
        }

        // Handle quick reply
        if (event.message?.quick_reply?.payload) {
          messages.push({
            senderId: event.sender?.id,
            recipientId: event.recipient?.id,
            message: event.message.quick_reply.payload,
            messageId: event.message.mid,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            isQuickReply: true,
          });
        }
      }
    }

    return messages;
  }
}

export default new FacebookAdapter();
