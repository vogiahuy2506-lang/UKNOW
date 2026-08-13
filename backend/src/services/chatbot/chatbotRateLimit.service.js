import IORedis from 'ioredis';
import { vnDayKey, vnMonthKey } from '../../utils/vnTimeFormat.util.js';
import {
  CHATBOT_REPLY_LIMIT_WINDOWS,
  DEFAULT_CHATBOT_REPLY_LIMIT_MESSAGE,
  hasEnabledChatbotReplyLimit,
  normalizeChatbotReplyLimitConfig,
} from '../../utils/chatbotReplyLimit.util.js';

const DEFAULT_STATIC_REPLY =
  'Trợ lý đang bận, chưa trả lời thêm được lúc này. Bạn cứ để lại câu hỏi, chúng tôi sẽ xem và phản hồi.';

const NOTIFY_REASONS = new Set([
  'sender_day',
  'chatbot_hour',
  'owner_cap',
  'custom_minute',
  'custom_hour',
  'custom_day',
  'custom_month',
]);
const OWNER_CAP_CACHE_TTL_MS = 60_000;
const CHATBOT_CONFIG_CACHE_TTL_MS = 60_000;
/** TTL cho khoá ngày lịch VN — đủ dài để khoá hôm qua tự dọn sau nửa đêm. */
const DAY_COUNTER_TTL_SEC = 172800;

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

/** ownerUserId → { value: number|null, expiresAt } */
const ownerCapCache = new Map();
/** chatbotId → { value: normalized config, expiresAt } */
const chatbotConfigCache = new Map();

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

function memoryHas(key) {
  const existing = memoryCounters.get(key);
  return !!(existing && existing.expiresAt > Date.now());
}

function memoryGetCount(key) {
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= Date.now()) return 0;
  return Number(existing.count) || 0;
}

function memorySet(key, windowSec) {
  memoryCounters.set(key, { count: 1, expiresAt: Date.now() + windowSec * 1000 });
}

function notifyWindowSec(reason) {
  if (reason === 'chatbot_hour' || reason === 'custom_hour') return 3600;
  if (reason === 'custom_minute') return 60;
  if (reason === 'custom_month') return 2_764_800;
  return 86400;
}

function ownerDayCounterKey(ownerUserId) {
  return `cbrl:owner:${ownerUserId}:d:${vnDayKey()}`;
}

function senderDayCounterKey(ch, bot, sender) {
  return `cbrl:sender:${ch}:${bot}:${sender}:d:${vnDayKey()}`;
}

function customBotCounter({ chatbotId, window }) {
  const bot = String(chatbotId || 'unknown');
  if (window === 'day') {
    return { key: `cbrl:custom:${bot}:d:${vnDayKey()}`, ttl: DAY_COUNTER_TTL_SEC };
  }
  if (window === 'month') {
    return { key: `cbrl:custom:${bot}:mo:${vnMonthKey()}`, ttl: 3_456_000 };
  }
  if (window === 'hour') return { key: `cbrl:custom:${bot}:h`, ttl: 3600 };
  return { key: `cbrl:custom:${bot}:m`, ttl: 60 };
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

  get perSenderPerHour() {
    return envInt('CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR', 20);
  }

  get perSenderPerDay() {
    return envInt('CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY', 50);
  }

  get perChatbotPerHour() {
    return envInt('CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR', 500);
  }

  /** Live system limits (from env) — for owner-facing UI. */
  get systemLimits() {
    return {
      perSenderPerMin: this.perSenderPerMin,
      perSenderPerHour: this.perSenderPerHour,
      perSenderPerDay: this.perSenderPerDay,
      perChatbotPerHour: this.perChatbotPerHour,
    };
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

  async hasKey(key) {
    const redis = await this.getRedis();
    if (!redis) return memoryHas(key);

    try {
      return (await redis.exists(key)) === 1;
    } catch (err) {
      console.warn('[ChatbotRateLimit] exists failed, memory fallback:', err.message);
      return memoryHas(key);
    }
  }

  async getCounter(key) {
    const redis = await this.getRedis();
    if (!redis) return memoryGetCount(key);

    try {
      const raw = await redis.get(key);
      if (raw == null) return 0;
      const n = Number.parseInt(String(raw), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (err) {
      console.warn('[ChatbotRateLimit] get failed, memory fallback:', err.message);
      return memoryGetCount(key);
    }
  }

  async setKeyWithTtl(key, windowSec) {
    const redis = await this.getRedis();
    if (!redis) {
      memorySet(key, windowSec);
      return;
    }

    try {
      await redis.set(key, '1', 'EX', windowSec);
    } catch (err) {
      console.warn('[ChatbotRateLimit] set failed, memory fallback:', err.message);
      memorySet(key, windowSec);
    }
  }

  notifiedKey({ channel, chatbotId, ownerUserId, senderKey, reason }) {
    const sender = String(senderKey || '').trim() || 'unknown';
    const owner = String(ownerUserId || '').trim();
    const bot = String(chatbotId || owner || 'unknown').trim();
    const ch = String(channel || 'unknown').trim();
    return `cbrl:notified:${ch}:${bot}:${sender}:${reason}`;
  }

  async resolveShouldNotify(params) {
    const { reason } = params;
    if (!NOTIFY_REASONS.has(reason)) return false;
    const already = await this.hasKey(this.notifiedKey(params));
    return !already;
  }

  /**
   * Mark that a rate-limit notice was successfully delivered.
   * Call ONLY after send/response succeeds.
   */
  async markRateLimitNotified({ channel, ownerUserId, chatbotId, senderKey, reason }) {
    if (!NOTIFY_REASONS.has(reason)) return;
    await this.setKeyWithTtl(
      this.notifiedKey({ channel, ownerUserId, chatbotId, senderKey, reason }),
      notifyWindowSec(reason)
    );
  }

  /**
   * Owner daily reply cap from users.bot_daily_reply_cap (cached ~60s).
   * NULL / missing column / DB error → no owner cap.
   */
  async getOwnerDailyCap(ownerUserId) {
    const owner = String(ownerUserId || '').trim();
    if (!owner) return null;

    const cached = ownerCapCache.get(owner);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // Unit tests force memory path — never hit Postgres (CI has no DB).
    if (this._skipDbOwnerCap) {
      return null;
    }

    let value = null;
    try {
      const db = (await import('../../config/database.js')).default;
      const { rows } = await db.query(
        'SELECT bot_daily_reply_cap FROM users WHERE id = $1',
        [owner]
      );
      const raw = rows[0]?.bot_daily_reply_cap;
      const n = Number(raw);
      value = Number.isFinite(n) && n > 0 ? n : null;
    } catch (err) {
      // Column missing before migration, or DB down — skip owner cap.
      console.warn('[ChatbotRateLimit] bot_daily_reply_cap read failed:', err.message);
      value = null;
    }

    ownerCapCache.set(owner, { value, expiresAt: Date.now() + OWNER_CAP_CACHE_TTL_MS });
    return value;
  }

  /** Invalidate cache after owner updates cap (also used in tests). */
  invalidateOwnerCapCache(ownerUserId) {
    if (ownerUserId == null) {
      ownerCapCache.clear();
      return;
    }
    ownerCapCache.delete(String(ownerUserId));
  }

  async getChatbotReplyLimitConfig(chatbotId, ownerUserId) {
    const bot = String(chatbotId || '').trim();
    if (!bot) {
      return {
        config: normalizeChatbotReplyLimitConfig(null),
        schemaAvailable: false,
      };
    }

    const cached = chatbotConfigCache.get(bot);
    if (cached && cached.expiresAt > Date.now()) {
      return { config: cached.value, schemaAvailable: cached.schemaAvailable };
    }

    if (this._skipDbChatbotConfig) {
      return {
        config: normalizeChatbotReplyLimitConfig(null),
        schemaAvailable: false,
      };
    }

    let value = normalizeChatbotReplyLimitConfig(null);
    let schemaAvailable = true;
    try {
      const db = (await import('../../config/database.js')).default;
      const params = [bot];
      let query = 'SELECT reply_limit_config FROM custom_chatbots WHERE id = $1';
      if (ownerUserId != null && String(ownerUserId).trim() !== '') {
        params.push(String(ownerUserId));
        query += ' AND id_user = $2';
      }
      const { rows } = await db.query(query, params);
      value = normalizeChatbotReplyLimitConfig(rows[0]?.reply_limit_config);
    } catch (err) {
      // Compatibility during rolling deploy before migration 127.
      schemaAvailable = false;
      console.warn('[ChatbotRateLimit] reply_limit_config read failed:', err.message);
    }

    chatbotConfigCache.set(bot, {
      value,
      schemaAvailable,
      expiresAt: Date.now() + CHATBOT_CONFIG_CACHE_TTL_MS,
    });
    return { config: value, schemaAvailable };
  }

  invalidateChatbotConfigCache(chatbotId) {
    if (chatbotId == null) {
      chatbotConfigCache.clear();
      return;
    }
    chatbotConfigCache.delete(String(chatbotId));
  }

  /**
   * Số lượt bot đã trả lời trong ngày lịch VN của một chủ tài khoản.
   * Chỉ đọc — không tăng bộ đếm.
   */
  async getOwnerUsedToday(ownerUserId) {
    const owner = String(ownerUserId || '').trim();
    if (!owner) return 0;
    try {
      return await this.getCounter(ownerDayCounterKey(owner));
    } catch (err) {
      console.warn('[ChatbotRateLimit] getOwnerUsedToday failed:', err.message);
      return 0;
    }
  }

  async buildBlockedResult({
    channel,
    ownerUserId,
    chatbotId,
    senderKey,
    reason,
    staticReply,
    action,
  }) {
    const shouldNotify = action === 'silent'
      ? false
      : await this.resolveShouldNotify({
        channel,
        ownerUserId,
        chatbotId,
        senderKey,
        reason,
      });
    return { allowed: false, reason, shouldNotify, staticReply };
  }

  async checkCustomChatbotLimits(scope) {
    const { config, schemaAvailable } = await this.getChatbotReplyLimitConfig(
      scope.chatbotId,
      scope.ownerUserId
    );
    const hasCustomLimits = hasEnabledChatbotReplyLimit(config);
    if (!hasCustomLimits) {
      return { blocked: null, hasCustomLimits: false, schemaAvailable };
    }

    for (const window of CHATBOT_REPLY_LIMIT_WINDOWS) {
      const rule = config.windows[window];
      if (rule.limit == null) continue;
      const counter = customBotCounter({ chatbotId: scope.chatbotId, window });
      const count = await this.incrWithTtl(counter.key, counter.ttl);
      if (count > rule.limit) {
        const staticReply = rule.action === 'notify'
          ? (rule.message || DEFAULT_CHATBOT_REPLY_LIMIT_MESSAGE)
          : '';
        return {
          hasCustomLimits: true,
          schemaAvailable,
          blocked: await this.buildBlockedResult({
            ...scope,
            reason: `custom_${window}`,
            action: rule.action,
            staticReply,
          }),
        };
      }
    }
    return { blocked: null, hasCustomLimits: true, schemaAvailable };
  }

  /**
   * Check + consume AI request quota for a sender / chatbot.
   * Call BEFORE invoking Gemini. Blocked requests must not charge credits.
   *
   * Order: sender_minute → sender_hour → sender_day → owner_cap → chatbot_hour
   * Early return does NOT increment later counters.
   *
   * @returns {Promise<{ allowed: boolean, reason?: string, shouldNotify: boolean, staticReply: string }>}
   */
  async checkBeforeAi({ channel, ownerUserId, chatbotId, senderKey }) {
    const staticReply = this.staticReply;
    const sender = String(senderKey || '').trim();
    const owner = String(ownerUserId || '').trim();
    const bot = String(chatbotId || owner || 'unknown').trim();
    const ch = String(channel || 'unknown').trim();
    const scope = { channel: ch, ownerUserId: owner, chatbotId: bot, senderKey: sender };

    if (!sender || sender === 'unknown') {
      const custom = await this.checkCustomChatbotLimits(scope);
      if (custom.blocked) return custom.blocked;
      // No stable identity — owner day count + chatbot hourly only.
      let ownerCount = 0;
      if (owner) {
        ownerCount = await this.incrWithTtl(ownerDayCounterKey(owner), DAY_COUNTER_TTL_SEC);
      }
      const ownerCap = custom.schemaAvailable ? null : await this.getOwnerDailyCap(owner);
      if (ownerCap != null && ownerCount > ownerCap) {
        return this.buildBlockedResult({ ...scope, reason: 'owner_cap', staticReply });
      }

      const hourCount = await this.incrWithTtl(`cbrl:bot:${ch}:${bot}:h`, 3600);
      if (hourCount > this.perChatbotPerHour) {
        return this.buildBlockedResult({ ...scope, reason: 'chatbot_hour', staticReply });
      }
      return { allowed: true, shouldNotify: false, staticReply };
    }

    const minCount = await this.incrWithTtl(
      `cbrl:sender:${ch}:${bot}:${sender}:m`,
      60
    );
    if (minCount > this.perSenderPerMin) {
      return this.buildBlockedResult({ ...scope, reason: 'sender_minute', staticReply });
    }

    const senderHourCount = await this.incrWithTtl(
      `cbrl:sender:${ch}:${bot}:${sender}:h`,
      3600
    );
    if (senderHourCount > this.perSenderPerHour) {
      return this.buildBlockedResult({ ...scope, reason: 'sender_hour', staticReply });
    }

    const dayCount = await this.incrWithTtl(
      senderDayCounterKey(ch, bot, sender),
      DAY_COUNTER_TTL_SEC
    );
    if (dayCount > this.perSenderPerDay) {
      return this.buildBlockedResult({ ...scope, reason: 'sender_day', staticReply });
    }

    const custom = await this.checkCustomChatbotLimits(scope);
    if (custom.blocked) return custom.blocked;

    const ownerCount = owner
      ? await this.incrWithTtl(ownerDayCounterKey(owner), DAY_COUNTER_TTL_SEC)
      : 0;
    const ownerCap = custom.schemaAvailable ? null : await this.getOwnerDailyCap(owner);
    if (ownerCap != null && ownerCount > ownerCap) {
      return this.buildBlockedResult({ ...scope, reason: 'owner_cap', staticReply });
    }

    const botHourCount = await this.incrWithTtl(`cbrl:bot:${ch}:${bot}:h`, 3600);
    if (botHourCount > this.perChatbotPerHour) {
      return this.buildBlockedResult({ ...scope, reason: 'chatbot_hour', staticReply });
    }

    return { allowed: true, shouldNotify: false, staticReply };
  }

  /** Test helper — clear memory counters + force memory path (no Redis/DB). */
  _resetMemoryForTests() {
    memoryCounters.clear();
    ownerCapCache.clear();
    chatbotConfigCache.clear();
    this.redisFailed = true;
    this.redis = null;
    this._skipDbOwnerCap = true;
    this._skipDbChatbotConfig = true;
  }

  /** Test helper — set owner cap without DB. */
  _setOwnerCapForTests(ownerUserId, cap) {
    const owner = String(ownerUserId);
    const n = Number(cap);
    const value = Number.isFinite(n) && n > 0 ? n : null;
    ownerCapCache.set(owner, { value, expiresAt: Date.now() + OWNER_CAP_CACHE_TTL_MS });
  }

  _setChatbotConfigForTests(chatbotId, config) {
    chatbotConfigCache.set(String(chatbotId), {
      value: normalizeChatbotReplyLimitConfig(config, { strict: true }),
      schemaAvailable: true,
      expiresAt: Date.now() + CHATBOT_CONFIG_CACHE_TTL_MS,
    });
  }
}

export default new ChatbotRateLimitService();
