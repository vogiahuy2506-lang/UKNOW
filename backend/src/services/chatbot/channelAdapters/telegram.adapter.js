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
    };
  }

  /**
   * Verify the shared-secret header sent by the Python gateway on the
   * incoming webhook. Throws on mismatch.
   */
  verifyWebhookSecret(provided) {
    const expected = process.env.TELEGRAM_GATEWAY_SECRET || '';
    if (!expected) {
      throw new Error('TELEGRAM_GATEWAY_SECRET is not configured');
    }
    if (!provided || provided !== expected) {
      throw new Error('Invalid Telegram gateway secret');
    }
  }
}

export default new TelegramPersonalAdapter();
