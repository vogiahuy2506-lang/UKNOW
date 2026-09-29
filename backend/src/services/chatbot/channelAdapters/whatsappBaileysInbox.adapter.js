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

export const ATTACHMENTS_UNSUPPORTED_ERROR = 'Hộp thư WhatsApp chưa gửi được tệp đính kèm';

/** Số điện thoại = phần cuối của `baileys:<sessionKey>:<chatbotId>:<phone>`. */
export function extractPhoneFromCompositeExternalId(externalId) {
  const parts = String(externalId || '').split(':');
  return parts[parts.length - 1] || '';
}

class WhatsAppBaileysInboxAdapter {
  async sendReply({ channelId, externalId, message, attachments, userId }) {
    if (Array.isArray(attachments) && attachments.length > 0) {
      return { success: false, error: ATTACHMENTS_UNSUPPORTED_ERROR, provider: 'baileys' };
    }
    const phone = extractPhoneFromCompositeExternalId(externalId);
    if (!phone) {
      return { success: false, error: 'Không xác định được số WhatsApp của khách', provider: 'baileys' };
    }
    const sessionKey = await channelConnectionsRepository.getBaileysSessionKey(channelId, userId);
    if (!sessionKey) {
      return { success: false, error: 'Không tìm thấy tài khoản WhatsApp của hội thoại này', provider: 'baileys' };
    }
    return whatsappAdapter.sendReply({ channelId: sessionKey, externalId: phone, message });
  }
}

export default new WhatsAppBaileysInboxAdapter();
