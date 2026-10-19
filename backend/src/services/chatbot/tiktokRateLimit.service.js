/**
 * tiktokRateLimit.service.js
 *
 * Rate limit cho TikTok Business Messaging:
 * - 10 tin tự động trong 48h sau lần user cuối cùng reply (Bẫy 3 plan)
 * - Sau 48h không reply → 3 tin cuối cùng (theo research)
 * - Cửa sổ 48h TRƯỢT (rolling window), không phải fixed
 *
 * Dùng 2 lớp (Bẫy 3 của plan):
 * 1. Redis: cache count trong key `tiktok:rate:{businessId}:{uniqueId}` (TTL 48h).
 *    - Hit → INCR + check >= 10
 *    - Miss → fallback SQL
 * 2. SQL: bảng `tiktok_outbound_log` (migration 306) — log mỗi lần gửi.
 *    - Đếm trong 48h gần nhất qua `WHERE sent_at > now() - interval '48 hours'`
 *    - Cron nightly xoá log cũ > 7 ngày
 *
 * Pattern copy từ `chatbotRateLimit.service.js` (Redis IORedis + SQL log).
 *
 * Việc 6 của plan tiktok-business-messaging-integration.md.
 */

import IORedis from 'ioredis';
import db from '../../config/database.js';

const RATE_WINDOW_HOURS = 48;
const MAX_AUTO_REPLIES_PER_WINDOW = 10;
const REDIS_KEY_TTL_SEC = RATE_WINDOW_HOURS * 3600 + 600; // 48h + 10 phút đệm

let _redis = null;

function buildRedisConfig() {
  const redisUrl = String(
    process.env.BULLMQ_REDIS_URL || process.env.REDIS_URL || ''
  ).trim();
  if (redisUrl) return redisUrl;

  const host = String(process.env.REDIS_HOST || '127.0.0.1').trim();
  const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
  const dbIdx = Number.parseInt(process.env.REDIS_DB || '0', 10);
  const password = String(process.env.REDIS_PASSWORD || '').trim();
  return {
    host,
    port: Number.isFinite(port) ? port : 6379,
    db: Number.isFinite(dbIdx) ? dbIdx : 0,
    ...(password ? { password } : {}),
  };
}

function getRedis() {
  if (_redis) return _redis;
  _redis = new IORedis(buildRedisConfig());
  return _redis;
}

class TiktokRateLimitService {
  /**
   * Check + log 1 tin gửi đi. Idempotent log: nếu log fail, return `allowed=false`
   * (fail-closed) để không vượt rate limit do lỗi log.
   *
   * @param {object} params
   * @param {string} params.businessId - tiktok_business_accounts.business_id
   * @param {string} params.uniqueIdentifier - user open_id từ webhook
   * @param {string} params.conversationId - để log
   * @returns {Promise<{allowed: boolean, currentCount: number, limit: number}>}
   */
  async checkAndLog({ businessId, uniqueIdentifier, conversationId }) {
    const key = `tiktok:rate:${businessId}:${uniqueIdentifier}`;
    let currentCount = 0;
    let usedRedis = false;

    // 1. Redis cache (Bẫy 3 — chặn race condition)
    try {
      const redis = getRedis();
      const cached = await redis.get(key);
      if (cached !== null) {
        currentCount = Number.parseInt(cached, 10) || 0;
        usedRedis = true;
      }
    } catch (redisErr) {
      console.warn('[TikTokRateLimit] Redis get failed, fallback SQL:', redisErr.message);
    }

    // 2. SQL fallback (khi cache miss) — đếm log trong 48h
    if (!usedRedis) {
      currentCount = await this._countFromSql({ businessId, uniqueIdentifier });
    }

    // 3. Quyết định
    if (currentCount >= MAX_AUTO_REPLIES_PER_WINDOW) {
      return { allowed: false, currentCount, limit: MAX_AUTO_REPLIES_PER_WINDOW };
    }

    // 4. Log + INCR (atomic: dùng Redis INCR, fail thì SQL INSERT)
    try {
      const redis = getRedis();
      const newCount = await redis.incr(key);
      if (newCount === 1) {
        await redis.expire(key, REDIS_KEY_TTL_SEC);
      }
      currentCount = newCount;
    } catch (redisErr) {
      console.warn('[TikTokRateLimit] Redis incr failed, fallback SQL:', redisErr.message);
      // Fallback SQL
      currentCount = await this._countFromSql({ businessId, uniqueIdentifier });
      if (currentCount >= MAX_AUTO_REPLIES_PER_WINDOW) {
        return { allowed: false, currentCount, limit: MAX_AUTO_REPLIES_PER_WINDOW };
      }
    }

    // 5. INSERT log SQL (audit + cross-check)
    try {
      await db.query(
        `INSERT INTO tiktok_outbound_log
           (business_id, unique_identifier, conversation_id, sent_at)
         VALUES ($1, $2, $3, NOW())`,
        [businessId, uniqueIdentifier, conversationId]
      );
    } catch (logErr) {
      // Bẫy 3: log fail → fail-closed, KHÔNG cho gửi
      console.error('[TikTokRateLimit] SQL log insert failed:', logErr.message);
      return { allowed: false, currentCount, limit: MAX_AUTO_REPLIES_PER_WINDOW };
    }

    return { allowed: true, currentCount, limit: MAX_AUTO_REPLIES_PER_WINDOW };
  }

  /**
   * Đếm log từ SQL. Dùng khi Redis miss / fail.
   * @returns {Promise<number>}
   */
  async _countFromSql({ businessId, uniqueIdentifier }) {
    try {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS cnt
         FROM tiktok_outbound_log
         WHERE business_id = $1
           AND unique_identifier = $2
           AND sent_at > NOW() - ($3 || ' hours')::INTERVAL`,
        [businessId, uniqueIdentifier, RATE_WINDOW_HOURS]
      );
      return rows[0]?.cnt || 0;
    } catch (err) {
      // Bảng chưa tồn tại (chưa chạy migration 306) → trả 0 để không block
      if (err.code === '42P01') {
        console.warn('[TikTokRateLimit] tiktok_outbound_log chưa tồn tại, bỏ qua rate limit SQL');
        return 0;
      }
      throw err;
    }
  }

  /**
   * Cron nightly — xoá log cũ hơn 7 ngày. Mount ở scheduler.
   */
  async cleanupOldLogs() {
    try {
      const { rowCount } = await db.query(
        `DELETE FROM tiktok_outbound_log WHERE sent_at < NOW() - INTERVAL '7 days'`
      );
      return { deleted: rowCount || 0 };
    } catch (err) {
      if (err.code === '42P01') return { deleted: 0 };
      throw err;
    }
  }
}

export default new TiktokRateLimitService();
