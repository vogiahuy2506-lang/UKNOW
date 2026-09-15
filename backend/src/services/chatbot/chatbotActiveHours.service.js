import IORedis from 'ioredis';
import {
  isWithinActiveHours,
  computeActiveHoursPeriodKey,
} from '../../utils/chatbotActiveHours.util.js';

const memoryNotifiedCache = new Map();

class ChatbotActiveHoursService {
  constructor() {
    this.redis = null;
    this.redisFailed = false;
    if (process.env.NODE_ENV !== 'test') {
      this._initRedis();
    }
  }

  _initRedis() {
    try {
      const redisUrl = process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL;
      const host = process.env.REDIS_HOST || '127.0.0.1';
      const port = Number(process.env.REDIS_PORT) || 6379;
      this.redis = redisUrl
        ? new IORedis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false })
        : new IORedis({ host, port, maxRetriesPerRequest: 1, lazyConnect: true, enableOfflineQueue: false });
      this.redis.on('error', () => {
        this.redisFailed = true;
      });
    } catch {
      this.redisFailed = true;
    }
  }

  /**
   * Tạo khoá Redis/Memory cho việc thông báo 1 lần / đợt ngoài giờ:
   * cbah:<channel>:<chatbotId>:<senderKey>:<periodKey>
   */
  getNotifiedKey({ channel, chatbotId, senderKey, activeHours, now = new Date() }) {
    const periodKey = computeActiveHoursPeriodKey(activeHours, now);
    return `cbah:${channel}:${chatbotId}:${senderKey}:${periodKey}`;
  }

  async hasNotified(key) {
    if (this.redis && !this.redisFailed) {
      try {
        const val = await this.redis.get(key);
        return Boolean(val);
      } catch {
        this.redisFailed = true;
      }
    }
    const expiresAt = memoryNotifiedCache.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      memoryNotifiedCache.delete(key);
      return false;
    }
    return true;
  }

  async setNotified(key, ttlSec = 86400) {
    if (this.redis && !this.redisFailed) {
      try {
        await this.redis.set(key, '1', 'EX', ttlSec);
        return;
      } catch {
        this.redisFailed = true;
      }
    }
    memoryNotifiedCache.set(key, Date.now() + ttlSec * 1000);
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
    // Nếu không cấu hình active_hours (null/undefined) hoặc đang trong giờ hoạt động
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

    // Với action = 'message': gửi tối đa 1 lần / người gửi / đợt ngoài giờ
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
   * TTL: 86400s (1 ngày).
   */
  async markNotified({ channel, chatbotId, senderKey, activeHours, now = new Date() }) {
    if (!activeHours || activeHours.outsideAction !== 'message') return;

    const key = this.getNotifiedKey({ channel, chatbotId, senderKey, activeHours, now });
    await this.setNotified(key, 86400);
  }

  /**
   * Helper xóa cache bộ nhớ dùng cho test suite
   */
  async clearAllForTest() {
    memoryNotifiedCache.clear();
  }
}

export default new ChatbotActiveHoursService();
