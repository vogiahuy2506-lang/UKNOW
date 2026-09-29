import channelConnectionsRepository from '../../../repositories/ai/channelConnections.repository.js';
import {
  parseTelegramInboxExternalId,
  recordManualReplyInLegacyTables,
} from '../telegramInbox.service.js';

/**
 * Adapter cho Hộp thư hợp nhất (trả lời tay / thử lại) với hội thoại Telegram cá nhân.
 *
 * Khác adapter chatbot (`telegram.adapter.js`): Hộp thư chỉ biết
 *   - `channelId`  = channel_conversations.id_channel (khoá số của channel_connections)
 *   - `externalId` = chuỗi GHÉP `telegram:<accountId>:<chatId>` (chatId nhóm âm giữ nguyên)
 * nên phải tra tài khoản + tách chatId rồi mới gọi adapter gửi thật. Không ném lỗi: mọi thất bại trả
 * `{ success:false, error }` để UnifiedInboxService đánh dấu tin `failed` (cho thử lại).
 */

export const ATTACHMENTS_UNSUPPORTED_ERROR = 'Hộp thư Telegram chưa gửi được tệp đính kèm';

class TelegramInboxAdapter {
  async sendReply({ channelId, externalId, message, attachments, userId }) {
    if (Array.isArray(attachments) && attachments.length > 0) {
      return { success: false, error: ATTACHMENTS_UNSUPPORTED_ERROR, provider: 'telegram' };
    }
    const target = parseTelegramInboxExternalId(externalId);
    if (!target) {
      return { success: false, error: 'Không xác định được cuộc trò chuyện Telegram của khách', provider: 'telegram' };
    }
    const accountId = await channelConnectionsRepository.getTelegramAccountId(channelId, userId);
    if (!accountId || accountId !== target.accountId) {
      return { success: false, error: 'Không tìm thấy tài khoản Telegram của hội thoại này', provider: 'telegram' };
    }
    try {
      // Import trễ: telegram.adapter kéo theo gateway (gắn hook tắt tiến trình) — đừng nạp khi chỉ dựng Hộp thư.
      const { default: telegramAdapter } = await import('./telegram.adapter.js');
      // telegramAdapter kiểm chủ sở hữu (getAccountById theo userId) + tài khoản còn hoạt động.
      const sent = await telegramAdapter.sendReply({
        userId,
        channelId: accountId,
        externalId: target.chatId,
        message,
      });
      const messageId = sent?.messageId ?? null;
      await recordManualReplyInLegacyTables({
        accountId,
        chatId: target.chatId,
        userId,
        text: message,
        messageId,
      });
      return { success: true, messageId, provider: 'telegram' };
    } catch (err) {
      return { success: false, error: err?.message || 'Gửi Telegram thất bại', provider: 'telegram' };
    }
  }
}

export default new TelegramInboxAdapter();
