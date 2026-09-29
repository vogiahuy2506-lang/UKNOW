/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — tốc độ gửi 3 mức + ngưỡng cảnh báo gửi/ngày cho tài khoản
 * Telegram / WhatsApp (chiến dịch + gửi nhanh). Khuôn `zaloSendSpeed.util.js` + sàn cứng của
 * `zaloRateLimiter.resolveOutboundPolicy`.
 *
 * - `safe` = KHÔNG ghi đè (NULL/NULL) → dùng nguyên mức env của kênh (Telegram 5–10s, WhatsApp 8–20s mặc định).
 * - `fast` / `very_fast` = ghi đè theo tài khoản, ĐƯỢC nhanh hơn env nhưng KHÔNG BAO GIỜ dưới sàn cứng.
 * - WhatsApp khoá số tích cực hơn Telegram (khoá cả số khi gửi số lạ hàng loạt) nên preset chậm hơn phần nào
 *   và sàn cao hơn. Chưa có số liệu thật cho hai kênh này — con số bảo thủ, chỉnh khi có dữ liệu.
 */

export const CHANNEL_SEND_SPEED_KEYS = Object.freeze(['safe', 'fast', 'very_fast']);

/** Sàn cứng (ms) giữa hai tin — áp cho MỌI giá trị ghi đè, kể cả đặt tay bằng SQL. */
export const CHANNEL_SEND_SPEED_HARD_FLOOR_MS = Object.freeze({
  telegram: 2_000,
  whatsapp: 3_000,
});

export const CHANNEL_SEND_SPEED_PRESETS = Object.freeze({
  telegram: Object.freeze({
    safe: Object.freeze({ key: 'safe', delayMinMs: null, delayMaxMs: null }),
    fast: Object.freeze({ key: 'fast', delayMinMs: 3_000, delayMaxMs: 6_000 }),
    very_fast: Object.freeze({ key: 'very_fast', delayMinMs: 2_000, delayMaxMs: 4_000 }),
  }),
  whatsapp: Object.freeze({
    safe: Object.freeze({ key: 'safe', delayMinMs: null, delayMaxMs: null }),
    fast: Object.freeze({ key: 'fast', delayMinMs: 5_000, delayMaxMs: 10_000 }),
    very_fast: Object.freeze({ key: 'very_fast', delayMinMs: 3_000, delayMaxMs: 6_000 }),
  }),
});

/**
 * Ngưỡng CẢNH BÁO (không chặn) khi người dùng đặt trần gửi/ngày cao hơn mức này — chỉ hiện chữ vàng ở FE.
 * Telegram 150/ngày (nhịp mặc định 5–10s), WhatsApp 100/ngày (khoá số nhanh hơn).
 */
export const CHANNEL_DAILY_WARN_THRESHOLD = Object.freeze({
  telegram: 150,
  whatsapp: 100,
});

/** Trần kỹ thuật chống tràn INTEGER cho ô "giới hạn/ngày" (không phải lời khuyên) — cùng Zalo. */
export const CHANNEL_DAILY_LIMIT_MAX = 100_000;

export function isChannelWithSendSettings(channel) {
  return Object.prototype.hasOwnProperty.call(CHANNEL_SEND_SPEED_PRESETS, String(channel || ''));
}

/**
 * @param {'telegram'|'whatsapp'} channel
 * @param {string} sendSpeed
 * @returns {{key: string, delayMinMs: number|null, delayMaxMs: number|null}|null}
 */
export function getChannelSendSpeedPreset(channel, sendSpeed) {
  const presets = CHANNEL_SEND_SPEED_PRESETS[channel];
  if (!presets) return null;
  return Object.prototype.hasOwnProperty.call(presets, sendSpeed) ? presets[sendSpeed] : null;
}

/**
 * Suy ra mức tốc độ từ cặp giá trị lưu trong DB.
 * @returns {'safe'|'fast'|'very_fast'|'custom'}
 */
export function resolveChannelSendSpeedFromRow(channel, dmin, dmax) {
  const min = dmin === null || dmin === undefined ? null : Number(dmin);
  const max = dmax === null || dmax === undefined ? null : Number(dmax);
  if (min === null && max === null) return 'safe';
  const presets = CHANNEL_SEND_SPEED_PRESETS[channel];
  if (presets) {
    for (const key of ['fast', 'very_fast']) {
      if (presets[key].delayMinMs === min && presets[key].delayMaxMs === max) return key;
    }
  }
  return 'custom';
}

/**
 * Áp ghi đè giãn cách theo tài khoản lên policy kênh (KHÔNG sửa policy gốc).
 * Không có ghi đè (thiếu một trong hai) → trả nguyên policy (mức env, KHÔNG kẹp lên sàn — khuôn Zalo).
 * Có ghi đè → min kẹp lên sàn cứng, max kẹp theo min SAU khi kẹp (không theo max của env: kẹp theo env
 * thì mức 2–4s thành 2–10s, vẫn "nhanh hơn" nên rất khó phát hiện).
 *
 * @param {'telegram'|'whatsapp'} channel
 * @param {object} policy `{minDelayMs, maxDelayMs, ...}` từ descriptor
 * @param {{delayMinMs?: number|null, delayMaxMs?: number|null}|null} settings
 * @returns {object} policy mới
 */
export function applyAccountDelayOverride(channel, policy, settings) {
  const floor = CHANNEL_SEND_SPEED_HARD_FLOOR_MS[channel];
  const dMin = Number.parseInt(settings?.delayMinMs, 10);
  const dMax = Number.parseInt(settings?.delayMaxMs, 10);
  if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || !floor) return policy;
  const minDelayMs = Math.max(floor, dMin);
  const maxDelayMs = Math.max(minDelayMs, dMax);
  return { ...policy, minDelayMs, maxDelayMs };
}
