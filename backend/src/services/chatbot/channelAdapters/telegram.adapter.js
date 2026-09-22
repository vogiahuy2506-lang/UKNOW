/**
 * telegram.adapter.js
 *
 * Channel adapter for personal Telegram accounts. Unlike the other
 * adapters (Zalo OA, Facebook, WhatsApp Cloud) this one does NOT call
 * the Telegram API directly — it delegates every send to the standalone
 * Python `telegram-gateway` service via telegramGateway.client.
 *
 * Keeping the adapter thin means Node.js never holds MTProto sockets;
 * all session / connection concerns live in Python.
 */
import telegramGateway from '../telegramGateway.client.js';
import chatbotTelegramRepository from '../../../repositories/chatbot/chatbotTelegram.repository.js';

class TelegramPersonalAdapter {
  /**
   * Send a reply message back through the Telegram account.
   *
   * @param {object} params
   * @param {string} params.conversationId - chatbot conversation id (unused here)
   * @param {string} params.message        - text to send
   * @param {number} params.userId         - UKNOW owner user id
   * @param {number} params.channelId      - telegram_accounts.id (NOT telegram_user_id)
   * @param {string} params.externalId     - chat id (Telegram peer)
   */
  async sendReply({ conversationId, message, userId, channelId, externalId }) {
    if (!channelId) {
      throw new Error('Telegram adapter: channelId is required');
    }
    if (!externalId) {
      throw new Error('Telegram adapter: externalId (chat id) is required');
    }

    const account = await chatbotTelegramRepository.getAccountById(channelId, { userId });
    if (!account) {
      throw new Error(`Telegram account ${channelId} not found for user ${userId}`);
    }
    if (!account.is_active) {
      throw new Error(`Telegram account ${channelId} is inactive`);
    }

    const chatId = Number.isFinite(Number(externalId)) ? Number(externalId) : externalId;
    await telegramGateway.sendMessage(account.telegram_user_id, chatId, String(message || '').slice(0, 4000));
    await chatbotTelegramRepository.touchActivity(channelId);

    return { success: true };
  }

  /**
   * The Python gateway already parses MTProto events and POSTs a clean
   * payload to /api/internal/telegram-webhook. This parser therefore
   * only validates that the body has the shape we expect.
   */
  parseWebhookEvent(body) {
    if (!body || typeof body !== 'object') {
      return { event: null, message: null, senderId: null };
    }
    const text = body.text || body.message || '';
    const senderId = body.sender_id != null ? String(body.sender_id) : null;
    const senderName = body.sender_name || null;
    return {
      event: 'message',
      message: text,
      senderId,
      senderName,
      chatId: body.chat_id != null ? String(body.chat_id) : null,
      isGroup: Boolean(body.is_group),
      isPrivate: body.is_private !== false ? !body.is_group : Boolean(body.is_private),
      telegramUserId: body.telegram_user_id != null ? Number(body.telegram_user_id) : null,
      // Surfaced for InboundReplyDebounceService dedupe. The webhook
      // (`internal.routes.js`) uses this as the `eventId` so a provider
      // retry of the same Telegram message_id collapses to a single AI
      // call instead of double-replying. Was previously dropped on the
      // floor (`eventId: req.body?.message_id ?? null` was the only
      // place it was read, and parseWebhookEvent didn't expose it).
      messageId:
        body.message_id != null
          ? Number(body.message_id)
          : body.event_id != null
          ? Number(body.event_id)
          : null,
    };
  }

  /**
   * Verify the shared-secret header sent by the Telegram transport
   * (now in-process). Throws on mismatch. The secret is read from the
   * channel gateway state — populated by the bootstrap with the same
   * symmetric key the embedded mode used to generate.
   */
  async verifyWebhookSecret(provided) {
    let expected = '';
    try {
      const { getSecret } = await import('../inProcChannelGateway/index.js');
      expected = getSecret('telegram') || '';
    } catch {
      expected = '';
    }
    if (!expected) {
      throw new Error('TELEGRAM_GATEWAY_SECRET is not configured');
    }
    if (!provided || provided !== expected) {
      throw new Error('Invalid Telegram gateway secret');
    }
  }
}

export default new TelegramPersonalAdapter();
