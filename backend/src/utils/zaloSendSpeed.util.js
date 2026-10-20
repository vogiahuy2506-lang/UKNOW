/**
 * Tiện ích và cấu hình mức tốc độ gửi Zalo cá nhân.
 * 2 mức tốc độ gửi Zalo cá nhân: `safe` (theo env) và `fast` (50–100 giây). Mức "Rất nhanh"
 * (`very_fast`, 30–60 giây) đã bỏ 20/10/2026: nick 34 đặt mức này mất 44% tin (61/138) với lỗi
 * [ZALO_SEND_NOT_DELIVERED] trong buổi sáng, cả tháng trước chỉ 4 lần. Sàn cứng 50 giây xem
 * `ZALO_PERSONAL_DELAY_HARD_FLOOR_MS` ở `zaloRateLimiter.js`.
 * (Telegram/WhatsApp có `channelSendSpeed.util.js` riêng, vẫn còn `very_fast` — khác kênh, khác giới hạn.)
 */

export const ZALO_SEND_SPEED_PRESETS = Object.freeze({
  safe: {
    key: 'safe',
    name: 'An toàn',
    delayMinMs: null,
    delayMaxMs: null,
  },
  fast: {
    key: 'fast',
    name: 'Nhanh',
    delayMinMs: 50_000,
    delayMaxMs: 100_000,
  },
});

export const VALID_SEND_SPEED_KEYS = Object.freeze(['safe', 'fast']);

/**
 * Suy ra tên mức tốc độ gửi từ giá trị dmin, dmax lưu trong DB.
 *
 * @param {number|string|null|undefined} dmin
 * @param {number|string|null|undefined} dmax
 * @returns {'safe' | 'fast' | 'custom'} Cặp 30–60s cũ (mức "Rất nhanh" đã bỏ) và mọi giá trị khác
 *   → `custom`: màn hình Zalo đã hiển thị `custom` là dòng chỉ đọc "Tuỳ chỉnh (do quản trị đặt)",
 *   còn sàn cứng vẫn kẹp thực tế lên ≥ 50s khi gửi. KHÔNG gán nhầm 30–60s thành `fast`.
 */
export function resolveSendSpeedFromRow(dmin, dmax) {
  const min = dmin === null || dmin === undefined ? null : Number(dmin);
  const max = dmax === null || dmax === undefined ? null : Number(dmax);

  if (min === null && max === null) {
    return 'safe';
  }
  if (min === 50_000 && max === 100_000) {
    return 'fast';
  }
  return 'custom';
}
