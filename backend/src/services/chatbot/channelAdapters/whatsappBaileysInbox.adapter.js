import channelConnectionsRepository from '../../../repositories/ai/channelConnections.repository.js';
import whatsappAdapter from './whatsapp.adapter.js';

/**
 * Adapter cho Hộp thư hợp nhất (trả lời tay / thử lại) với hội thoại WhatsApp QR (Baileys).
 *
 * Khác adapter chatbot (`whatsapp.adapter.js`): Hộp thư chỉ biết
 *   - `channelId`  = channel_conversations.id_channel (khoá số của channel_connections)
 *   - `externalId` = chuỗi GHÉP `baileys:<sessionKey>:<chatbotId>:<phone>`
 * nên phải tra session key + tách số điện thoại rồi mới gọi adapter gửi thật.
 */

/** Số điện thoại = phần cuối của `baileys:<sessionKey>:<chatbotId>:<phone>`. */
export function extractPhoneFromCompositeExternalId(externalId) {
  const parts = String(externalId || '').split(':');
  return parts[parts.length - 1] || '';
}

class WhatsAppBaileysInboxAdapter {
  async sendReply({ channelId, externalId, message, attachments, userId }) {
    const phone = extractPhoneFromCompositeExternalId(externalId);
    if (!phone) {
      return { success: false, error: 'Không xác định được số WhatsApp của khách', provider: 'baileys' };
    }
    const sessionKey = await channelConnectionsRepository.getBaileysSessionKey(channelId, userId);
    if (!sessionKey) {
      return { success: false, error: 'Không tìm thấy tài khoản WhatsApp của hội thoại này', provider: 'baileys' };
    }
    // P6 — tài khoản bị khoá do vượt hạn mức gói: không trả lời tay (tin đánh dấu failed, thử lại được sau khi mở khoá).
    const { whatsappSessionIsLocked, CHANNEL_ACCOUNT_LOCKED_MESSAGE } = await import('../../../utils/topupLockGate.util.js');
    if (await whatsappSessionIsLocked(sessionKey)) {
      return { success: false, error: CHANNEL_ACCOUNT_LOCKED_MESSAGE, provider: 'baileys' };
    }
    // P5: tep dinh kem (khoa kho chat cua chu) — whatsapp.adapter loc theo chu + gui text -> anh -> tai lieu.
    return whatsappAdapter.sendReply({ channelId: sessionKey, externalId: phone, message, attachments, userId });
  }
}

export default new WhatsAppBaileysInboxAdapter();
