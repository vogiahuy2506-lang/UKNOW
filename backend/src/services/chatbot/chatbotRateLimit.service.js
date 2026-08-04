import IORedis from 'ioredis';

const DEFAULT_STATIC_REPLY =
  'Bạn gửi hơi nhanh, vui lòng chờ chút rồi thử lại nhé.';

function envInt(name, fallback) {
  const parsed = Number.parseInt(String(process.env[name] || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildRedisConfig() {
  const redisUrl = String(
    process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || ''
  ).trim();
  if (redisUrl) return redisUrl;

  const host = String(process.env.REDIS_HOST || '127.0.0.1').trim();
  const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
  const db = Number.parseInt(process.env.REDIS_DB || '0', 10);
  const password = String(process.env.REDIS_PASSWORD || '').trim();
  return {
    host,
    port: Number.isFinite(port) ? port : 6379,
    db: Number.isFinite(db) ? db : 0,
    ...(password ? { password } : {}),
  };
}

/**
 * In-memory fallback counters when Redis is unavailable.
 * Key → { count, expiresAt }
 */
const memoryCounters = new Map();

function memoryIncr(key, windowSec) {
  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

class ChatbotRateLimitService {
  constructor() {
    this.redis = null;
    this.redisFailed = false;
    this.connecting = null;
  }

  get staticReply() {
    return String(process.env.CHATBOT_RATE_LIMIT_STATIC_REPLY || DEFAULT_STATIC_REPLY).trim()
      || DEFAULT_STATIC_REPLY;
  }

  get perSenderPerMin() {
    return envInt('CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN', 8);
  }

  get perSenderPerDay() {
    return envInt('CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY', 50);
  }

  get perChatbotPerHour() {
    return envInt('CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR', 500);
  }

  async getRedis() {
    if (this.redisFailed) return null;
    if (this.redis) return this.redis;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        const connectTimeout = envInt('REDIS_CONNECT_TIMEOUT_MS', 5000);
        const client = new IORedis(buildRedisConfig(), {
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
          connectTimeout,
          lazyConnect: true,
        });
        client.on('error', (err) => {
          console.warn('[ChatbotRateLimit] Redis error:', err.message);
        });
        await client.connect();
        this.redis = client;
        return client;
      } catch (err) {
        console.warn('[ChatbotRateLimit] Redis unavailable, using memory fallback:', err.message);
        this.redisFailed = true;
        return null;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  async incrWithTtl(key, windowSec) {
    const redis = await this.getRedis();
    if (!redis) return memoryIncr(key, windowSec);

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSec);
      }
      return count;
    } catch (err) {
      console.warn('[ChatbotRateLimit] incr failed, memory fallback:', err.message);
      return memoryIncr(key, windowSec);
    }
  }

  /**
   * Check + consume AI request quota for a sender / chatbot.
   * Call BEFORE invoking Gemini. Blocked requests must not charge credits.
   *
   * @param {object} params
   * @param {string} params.channel - web | zalo_oa | facebook | zalo_personal
   * @param {string|number} params.ownerUserId
   * @param {string|number} [params.chatbotId] - chatbot or account scope id
   * @param {string|number} params.senderKey - sessionId / Zalo uid / PSID
   * @returns {Promise<{ allowed: boolean, reason?: string, staticReply: string }>}
   */
  async checkBeforeAi({ channel, ownerUserId, chatbotId, senderKey }) {
    const staticReply = this.staticReply;
    const sender = String(senderKey || '').trim();
    const owner = String(ownerUserId || '').trim();
    const bot = String(chatbotId || owner || 'unknown').trim();
    const ch = String(channel || 'unknown').trim();

    if (!sender || sender === 'unknown') {
      // No stable identity — still apply chatbot hourly ceiling only.
      const hourCount = await this.incrWithTtl(
        `cbrl:bot:${ch}:${bot}:h`,
        3600
      );
      if (hourCount > this.perChatbotPerHour) {
        return { allowed: false, reason: 'chatbot_hour', staticReply };
      }
      return { allowed: true, staticReply };
    }

    const minCount = await this.incrWithTtl(
      `cbrl:sender:${ch}:${bot}:${sender}:m`,
      60
    );
    if (minCount > this.perSenderPerMin) {
      return { allowed: false, reason: 'sender_minute', staticReply };
    }

    const dayCount = await this.incrWithTtl(
      `cbrl:sender:${ch}:${bot}:${sender}:d`,
      86400
    );
    if (dayCount > this.perSenderPerDay) {
      return { allowed: false, reason: 'sender_day', staticReply };
    }

    const hourCount = await this.incrWithTtl(
      `cbrl:bot:${ch}:${bot}:h`,
      3600
    );
    if (hourCount > this.perChatbotPerHour) {
      return { allowed: false, reason: 'chatbot_hour', staticReply };
    }

    return { allowed: true, staticReply };
  }

  /** Test helper — clear memory counters. */
  _resetMemoryForTests() {
    memoryCounters.clear();
    this.redisFailed = true; // force memory path in unit tests
    this.redis = null;
  }
}

export default new ChatbotRateLimitService();
