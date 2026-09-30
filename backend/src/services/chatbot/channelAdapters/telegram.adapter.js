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
import crypto from 'crypto';
import telegramGateway from '../telegramGateway.client.js';
import chatbotTelegramRepository from '../../../repositories/chatbot/chatbotTelegram.repository.js';
import {
  TELEGRAM_PHOTO_EXTENSIONS,
  prepareChannelAttachmentSources,
  sendChannelMessageWithMedia,
} from '../../../utils/channelMediaSend.util.js';

/**
 * P5 — gui text + anh/tai lieu toi mot chat Telegram (dung chung util thu tu: text -> tung anh -> tung tai lieu).
 * Nem loi khi tin DAU that bai (khach chua nhan gi); loi o tep SAU tra `{ sentCount, error }`.
 */
export async function sendTelegramMessageWithMedia({ telegramUserId, chatId, text, sources }) {
  return sendChannelMessageWithMedia({
    text: String(text || '').slice(0, 4000),
    sources,
    imageExtensions: TELEGRAM_PHOTO_EXTENSIONS,
    sendText: (value) => telegramGateway.sendMessage(telegramUserId, chatId, value),
    sendImage: (file) => telegramGateway.sendMedia(telegramUserId, chatId, { ...file, kind: 'photo' }),
    sendDocument: (file) => telegramGateway.sendMedia(telegramUserId, chatId, { ...file, kind: 'document' }),
  });
}

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
   * @param {Array}  [params.attachments]  - P5: tep dinh kem (metadata kho media, co `key`) — loc theo chu `userId`
   */
  async sendReply({ conversationId, message, userId, channelId, externalId, attachments }) {
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

    const attachmentList = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (attachmentList.length > 0) {
      // Hop thu: nguoi dung chu dong dinh kem -> thieu tep (khong doc duoc / khong thuoc chu) la LOI, khong lang le
      // gui moi phan text (khac chien dich: chay nhieu nguoi, bo tep hong roi van gui).
      const sources = await prepareChannelAttachmentSources(attachmentList, { ownerUserId: userId });
      if (sources.length < attachmentList.length) {
        throw new Error('Không đọc được một số tệp đính kèm — hãy đính kèm lại.');
      }
      const result = await sendTelegramMessageWithMedia({
        telegramUserId: account.telegram_user_id,
        chatId,
        text: message,
        sources,
      });
      await chatbotTelegramRepository.touchActivity(channelId);
      if (result.error) {
        return {
          success: false,
          partial: true,
          error: `Đã gửi ${result.sentCount} phần nhưng có tệp chưa gửi được: ${result.error.message}`,
          messageId: result.firstMessageId,
          messageIds: result.messageIds,
        };
      }
      return { success: true, messageId: result.firstMessageId, messageIds: result.messageIds };
    }

    const sent = await telegramGateway.sendMessage(account.telegram_user_id, chatId, String(message || '').slice(0, 4000));
    await chatbotTelegramRepository.touchActivity(channelId);

    // messageId để ghi vào dòng bot — khử echo khi chủ trả lời từ điện thoại (W6).
    const messageId = sent?.messageId ?? sent?.data?.messageId ?? null;
    return { success: true, messageId };
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
    // P5: anh/tai lieu khach gui (chi metadata; byte tai sau bang gateway.downloadMedia). Chi 'photo' | 'document'.
    const rawMedia = body.media && typeof body.media === 'object' ? body.media : null;
    const media = rawMedia && (rawMedia.kind === 'photo' || rawMedia.kind === 'document')
      ? {
        kind: rawMedia.kind,
        fileName: rawMedia.fileName != null ? String(rawMedia.fileName) : null,
        mimeType: rawMedia.mimeType != null ? String(rawMedia.mimeType) : null,
        size: rawMedia.size != null && rawMedia.size !== '' && Number.isFinite(Number(rawMedia.size))
          ? Number(rawMedia.size)
          : null,
      }
      : null;
    return {
      event: 'message',
      media,
      message: text,
      senderId,
      senderName,
      chatId: body.chat_id != null ? String(body.chat_id) : null,
      isGroup: Boolean(body.is_group),
      isPrivate: body.is_private !== false ? !body.is_group : Boolean(body.is_private),
      isOutgoing: body.is_outgoing === true,
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
   *
   * So khớp hằng thời gian trên digest SHA-256 của hai giá trị (cùng độ dài 32 byte nên
   * `timingSafeEqual` không ném lỗi và không lộ độ dài secret).
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
    if (typeof provided !== 'string' || !provided) {
      throw new Error('Invalid Telegram gateway secret');
    }
    const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
    const expectedDigest = crypto.createHash('sha256').update(String(expected), 'utf8').digest();
    if (!crypto.timingSafeEqual(providedDigest, expectedDigest)) {
      throw new Error('Invalid Telegram gateway secret');
    }
  }
}

export default new TelegramPersonalAdapter();
