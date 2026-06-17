import ZaloRateLimiter from './zaloRateLimiter.js';

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

/**
 * Tạo ZaloRateLimiter với cùng env config mà CampaignRunService dùng.
 *
 * @returns {ZaloRateLimiter}
 */
export function buildZaloRateLimiterFromEnv() {
  const quietStartRaw = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_START, 10);
  const quietEndRaw = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_END, 10);
  return new ZaloRateLimiter({
    ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT: parsePositiveInt(process.env.ZALO_OUTBOUND_PER_HOUR_LIMIT_DEFAULT, 100),
    ZALO_OUTBOUND_RATE_WINDOW_MS: parsePositiveInt(process.env.ZALO_OUTBOUND_RATE_WINDOW_MS, 60 * 60 * 1000),
    ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT: parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MIN_MS_DEFAULT, 20_000),
    ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT: parsePositiveInt(process.env.ZALO_OUTBOUND_INTER_MESSAGE_MAX_MS_DEFAULT, 50_000),
    ZALO_OUTBOUND_QUIET_HOURS_START_SAFE: Number.isFinite(quietStartRaw) ? quietStartRaw : 23,
    ZALO_OUTBOUND_QUIET_HOURS_END_SAFE: Number.isFinite(quietEndRaw) ? quietEndRaw : 6,
    ZALO_PERSONAL_PER_HOUR_LIMIT: parsePositiveInt(process.env.ZALO_PERSONAL_PER_HOUR_LIMIT, 0),
    ZALO_PERSONAL_INTER_MESSAGE_MIN_MS: parsePositiveInt(process.env.ZALO_PERSONAL_INTER_MESSAGE_MIN_MS, 0),
    ZALO_PERSONAL_INTER_MESSAGE_MAX_MS: parsePositiveInt(process.env.ZALO_PERSONAL_INTER_MESSAGE_MAX_MS, 0),
    ZALO_PERSONAL_BLOCK_SEND_LIMIT: parsePositiveInt(process.env.ZALO_PERSONAL_BLOCK_SEND_LIMIT, 0),
    ZALO_PERSONAL_BLOCK_COOLDOWN_MS: parsePositiveInt(process.env.ZALO_PERSONAL_BLOCK_COOLDOWN_MS, 0),
    ZALO_GROUP_PER_HOUR_LIMIT: parsePositiveInt(process.env.ZALO_GROUP_PER_HOUR_LIMIT, 0),
    ZALO_GROUP_INTER_MESSAGE_MIN_MS: parsePositiveInt(process.env.ZALO_GROUP_INTER_MESSAGE_MIN_MS, 0),
    ZALO_GROUP_INTER_MESSAGE_MAX_MS: parsePositiveInt(process.env.ZALO_GROUP_INTER_MESSAGE_MAX_MS, 0),
    ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT: parsePositiveInt(process.env.ZALO_FRIEND_REQUEST_PER_HOUR_LIMIT, 0),
    ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS: parsePositiveInt(process.env.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MIN_MS, 0),
    ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS: parsePositiveInt(process.env.ZALO_FRIEND_REQUEST_INTER_MESSAGE_MAX_MS, 0),
    ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS: parsePositiveInt(process.env.ZALO_PERSONAL_PHONE_LOOKUP_COOLDOWN_MS, 3 * 60 * 60 * 1000),
    ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS: parsePositiveInt(process.env.ZALO_OUTBOUND_YIELD_SLOT_MIN_WAIT_MS, 60_000),
  });
}
