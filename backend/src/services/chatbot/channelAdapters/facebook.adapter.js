import axios from 'axios';
import chatbotChannelRepository from '../../../repositories/ai/chatbotChannel.repository.js';

const FB_GRAPH_BASE = 'https://graph.facebook.com/v18.0';

class FacebookAdapter {
  /**
   * Send a reply via Facebook Messenger Send API.
   * Uses credentials from database based on channel ID.
   * @param {object} params
   * @param {string} params.externalId - Facebook PSID
   * @param {string} params.message - text reply
   * @param {number} params.userId
   * @param {number} params.channelId - channel_connections.id
   * @param {object} [params.attachments] - Optional attachments to send
   * @param {Array<{type: string, url: string, caption?: string}>} params.attachments
   */
  async sendReply({ externalId, message, userId, channelId, attachments }) {
    try {
      // Get credentials from database
      let pageAccessToken;
      if (channelId) {
        pageAccessToken = await chatbotChannelRepository.getChannelPageAccessToken(channelId);
      }

      if (!pageAccessToken) {
        throw new Error('Facebook Page access token not configured');
      }

      // Build message body
      const messageBody = {
        recipient: { id: externalId },
        message: { text: message.slice(0, 2000) },
      };

      // If there are attachments, send them separately (Facebook requires attachment in attachment field)
      if (attachments && attachments.length > 0) {
        const sentMessages = [];

        // Send text first
        const textResult = await axios.post(
          `${FB_GRAPH_BASE}/me/messages`,
          messageBody,
          {
            params: { access_token: pageAccessToken },
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
          }
        );
        sentMessages.push({ type: 'text', mid: textResult.data?.message_id });

        // Send each attachment
        for (const att of attachments) {
          try {
            const attResult = await this._sendAttachment(externalId, att, pageAccessToken);
            sentMessages.push({ type: att.type, mid: attResult?.message_id });
          } catch (attErr) {
            console.warn(`[Facebook] Failed to send attachment ${att.type}:`, attErr.message);
          }
        }

        console.log(`[Facebook] Sent ${sentMessages.length} messages to PSID ${externalId}`);
        return { success: true, messages: sentMessages };
      }

      // Simple text-only send
      await axios.post(
        `${FB_GRAPH_BASE}/me/messages`,
        messageBody,
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
   * Send a single attachment (image, video, audio, file) to Facebook Messenger.
   * @private
   * @param {string} recipientId - PSID
   * @param {{type: string, url: string, caption?: string}} attachment
   * @param {string} pageAccessToken
   * @returns {Promise<object>}
   */
  async _sendAttachment(recipientId, attachment, pageAccessToken) {
    const { type, url } = attachment;

    // Map our types to Facebook attachment types
    const typeMap = {
      image: 'image',
      video: 'video',
      audio: 'audio',
      file: 'file',
    };
    const fbType = typeMap[type] || 'file';

    // Facebook requires uploading the attachment first to get an attachment_id,
    // then sending that attachment_id in the message.
    // For simplicity, we use the URL-based approach which works for public URLs.
    const attachmentPayload = {
      type: fbType,
      payload: {
        url: url,
        is_reusable: true, // Allow reusing this attachment
      },
    };

    // Upload attachment
    const uploadUrl = `${FB_GRAPH_BASE}/me/message_attachments`;
    const uploadResp = await axios.post(
      uploadUrl,
      {
        message: {
          attachment: attachmentPayload,
        },
      },
      {
        params: { access_token: pageAccessToken },
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    );

    const attachmentId = uploadResp.data?.attachment_id;
    if (!attachmentId) {
      throw new Error('No attachment_id returned from upload');
    }

    // Send the attachment_id to the recipient
    const sendUrl = `${FB_GRAPH_BASE}/me/messages`;
    const sendResp = await axios.post(
      sendUrl,
      {
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: fbType,
            payload: {
              attachment_id: attachmentId,
            },
          },
        },
      },
      {
        params: { access_token: pageAccessToken },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      }
    );

    return sendResp.data;
  }

  /**
   * Subscribe a Facebook Page to receive webhook events.
   * Should be called after OAuth when the page is first connected.
   * Meta requires this to actually deliver messages to your webhook.
   *
   * @param {string} pageId
   * @param {string} pageAccessToken
   * @returns {Promise<boolean>}
   */
  async subscribePage(pageId, pageAccessToken) {
    try {
      const resp = await axios.post(
        `${FB_GRAPH_BASE}/${pageId}/subscribed_apps`,
        {},
        {
          params: { access_token: pageAccessToken },
          timeout: 10000,
        }
      );
      console.log(`[Facebook] Subscribed page ${pageId} to webhook:`, resp.data);
      return true;
    } catch (err) {
      // 200 with {success: true} or 400 with "App is already subscribed" are both OK.
      const msg = err?.response?.data?.error?.message || err.message;
      if (String(msg).includes('already subscribed')) {
        console.log(`[Facebook] Page ${pageId} already subscribed — skipping.`);
        return true;
      }
      console.error(`[Facebook] Failed to subscribe page ${pageId}:`, msg);
      return false;
    }
  }

  /**
   * Verify Facebook webhook.
   * @param {string} mode
   * @param {string} token
   * @param {string} challenge
   * @param {string} customVerifyToken - verify token from channel credentials
   */
  verifyWebhook(mode, token, challenge, customVerifyToken = null) {
    const verifyToken = customVerifyToken || process.env.FACEBOOK_VERIFY_TOKEN || 'founderai';
    if (mode === 'subscribe' && token === verifyToken) {
      return { challenge };
    }
    throw new Error('Invalid Facebook verify token');
  }

  /**
   * Parse incoming Facebook Messenger webhook event.
   * Returns an array of parsed message objects (one per meaningful event).
   *
   * Handles:
   *   - Text messages (with optional attachments)
   *   - Quick reply payloads
   *   - Postback events (e.g. "Get Started" button)
   *   - Attachments (image URLs → appended to text as "[Hình ảnh: url]")
   *
   * @param {object} body
   * @returns {object[]} parsed messages
   */
  parseWebhookEvent(body) {
    const messages = [];

    if (body?.object !== 'page') return messages;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderId = event.sender?.id;
        const recipientId = event.recipient?.id;

        // ── Text message (with or without attachments) ──────────────────
        if (event.message && event.message.text) {
          const attachments = event.message.attachments || [];
          const attachmentText = buildAttachmentText(attachments);
          const text = attachmentText
            ? `${event.message.text}\n\n${attachmentText}`
            : event.message.text;

          messages.push({
            senderId,
            recipientId,
            message: text,
            messageId: event.message.mid,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            hasAttachments: attachments.length > 0,
            attachments,
          });
        }

        // ── Attachment-only message (no text) ──────────────────────────
        if (event.message && !event.message.text && event.message.attachments?.length) {
          const attachmentText = buildAttachmentText(event.message.attachments);
          if (attachmentText) {
            messages.push({
              senderId,
              recipientId,
              message: attachmentText,
              messageId: event.message.mid,
              timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
              hasAttachments: true,
              attachments: event.message.attachments,
            });
          }
        }

        // ── Quick reply payload ────────────────────────────────────────
        if (event.message?.quick_reply?.payload) {
          messages.push({
            senderId,
            recipientId,
            message: event.message.quick_reply.payload,
            messageId: event.message.mid,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            isQuickReply: true,
          });
        }

        // ── Postback (e.g. "Get Started", persistent menu clicks) ──────
        if (event.postback?.payload) {
          messages.push({
            senderId,
            recipientId,
            message: event.postback.payload,
            messageId: event.postback.mid || event.message?.mid || null,
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
            isPostback: true,
          });
        }
      }
    }

    return messages;
  }
}

/**
 * Convert attachment array to readable text for the AI.
 * @param {object[]} attachments
 * @returns {string}
 */
function buildAttachmentText(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';

  return attachments
    .map((att) => {
      if (att.type === 'image') {
        return `[Hình ảnh: ${att.payload?.url || 'URL không có'}]`;
      }
      if (att.type === 'video') {
        return `[Video: ${att.payload?.url || 'URL không có'}]`;
      }
      if (att.type === 'audio') {
        return `[Âm thanh: ${att.payload?.url || 'URL không có'}]`;
      }
      if (att.type === 'file') {
        return `[File: ${att.payload?.url || 'URL không có'}]`;
      }
      return `[Tệp đính kèm loại: ${att.type}]`;
    })
    .filter(Boolean)
    .join('\n');
}

export default new FacebookAdapter();
