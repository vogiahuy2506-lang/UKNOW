import chatbotRateLimitService from './chatbotRateLimit.service.js';
import {
  isWithinActiveHours,
  currentOutsideWindowStart,
} from '../../utils/chatbotActiveHours.util.js';

const NOTIFIED_TTL_SEC = 86400;

class ChatbotActiveHoursService {
  /**
   * Khoá "đã gửi câu ngoài giờ": cbah:<channel>:<chatbotId>:<senderKey>:<mốc bắt đầu đợt ngoài giờ>.
   *
   * Mốc = lần gần nhất đồng hồ VN chạm giờ `end` (currentOutsideWindowStart), KHÔNG phải ngày lịch:
   * khung 08:00–17:30 có đợt ngoài giờ 17:30 hôm nay → 08:00 hôm sau; khoá theo ngày lịch (bản đầu
   * 0acc4ad9) tách đợt đó làm hai và gửi câu ngoài giờ 2 lần cho người nhắn lúc 20:00 rồi 06:00.
   * Đợt ngoài giờ không bao giờ dài quá 24h nên TTL 86400 đủ.
   */
  getNotifiedKey({ channel, chatbotId, senderKey, activeHours, now = new Date() }) {
    const windowStart = currentOutsideWindowStart(activeHours, now);
    const period = windowStart ? windowStart.toISOString().slice(0, 16) : 'unknown';
    const sender = String(senderKey ?? '').trim() || 'unknown';
    return `cbah:${channel}:${chatbotId}:${sender}:${period}`;
  }

  // Dùng chung kho khoá có TTL của chatbotRateLimitService (Redis, tự lùi về bộ nhớ khi mất Redis)
  // thay vì mở kết nối Redis riêng.
  async hasNotified(key) {
    return chatbotRateLimitService.hasKey(key);
  }

  async setNotified(key, ttlSec = NOTIFIED_TTL_SEC) {
    await chatbotRateLimitService.setKeyWithTtl(key, ttlSec);
  }

  /**
   * Kiểm tra khung giờ hoạt động trước khi xử lý tin nhắn / gọi AI.
   *
   * @param {object} params
   * @param {object|null|undefined} params.activeHours - Cấu hình active_hours của chatbot
   * @param {string} params.channel - Tên kênh (zalo_personal, zalo_oa, facebook, whatsapp, web, telegram_personal...)
   * @param {number|string} params.chatbotId - ID chatbot
   * @param {string} params.senderKey - Mã định danh người gửi (senderId, phone, sessionId...)
   * @param {Date|string|number} [params.now=new Date()]
   * @returns {Promise<{ allowed: boolean, reason?: string, shouldNotify?: boolean, staticReply?: string|null }>}
   */
  async checkBeforeAi({ activeHours, channel, chatbotId, senderKey, now = new Date() }) {
    if (!activeHours || isWithinActiveHours(activeHours, now)) {
      return { allowed: true };
    }

    const outsideAction = activeHours.outsideAction || 'silent';
    const staticReply = activeHours.outsideMessage || null;

    if (outsideAction !== 'message' || !staticReply?.trim()) {
      return {
        allowed: false,
        reason: 'outside_active_hours',
        shouldNotify: false,
        staticReply: null,
      };
    }

    // outsideAction = 'message': gửi tối đa 1 lần / người gửi / đợt ngoài giờ
    const key = this.getNotifiedKey({ channel, chatbotId, senderKey, activeHours, now });
    const alreadyNotified = await this.hasNotified(key);

    return {
      allowed: false,
      reason: 'outside_active_hours',
      shouldNotify: !alreadyNotified,
      staticReply: alreadyNotified ? null : staticReply.trim(),
    };
  }

  /**
   * Đánh dấu đã gửi câu phản hồi ngoài giờ cho người gửi trong đợt này.
   */
  async markNotified({ channel, chatbotId, senderKey, activeHours, now = new Date() }) {
    if (!activeHours || activeHours.outsideAction !== 'message') return;

    const key = this.getNotifiedKey({ channel, chatbotId, senderKey, activeHours, now });
    await this.setNotified(key, NOTIFIED_TTL_SEC);
  }

  /** Xoá kho khoá bộ nhớ (dùng chung với rate limit) cho test. */
  async clearAllForTest() {
    chatbotRateLimitService._resetMemoryForTests();
  }
}

export default new ChatbotActiveHoursService();
