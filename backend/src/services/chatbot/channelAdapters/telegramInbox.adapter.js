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

class TelegramInboxAdapter {
  async sendReply({ channelId, externalId, message, attachments, userId }) {
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
        // P5: tep dinh kem (khoa kho chat cua chu) — telegram.adapter loc theo chu + gui text -> anh -> tai lieu.
        attachments,
      });
      const messageId = sent?.messageId ?? null;
      // Bang cu chi luu CHU; tin chi co tep (khong chu) khong tao dong rong.
      if (String(message || '').trim() !== '') {
        await recordManualReplyInLegacyTables({
          accountId,
          chatId: target.chatId,
          userId,
          text: message,
          messageId,
        });
      }
      if (sent?.success === false) {
        // Gui mot phan: khach DA nhan tin dau nhung co tep chua toi -> bao failed (chu thay va thu lai), kem id tin da toi.
        return { success: false, error: sent.error, messageId, provider: 'telegram' };
      }
      return { success: true, messageId, provider: 'telegram' };
    } catch (err) {
      return { success: false, error: err?.message || 'Gửi Telegram thất bại', provider: 'telegram' };
    }
  }
}

export default new TelegramInboxAdapter();
