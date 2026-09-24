/**
 * Tiện ích và cấu hình mức tốc độ gửi Zalo cá nhân.
 * (Theo thiết kế 3 mức tốc độ gửi Zalo cá nhân, sàn cứng 30s)
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
  very_fast: {
    key: 'very_fast',
    name: 'Rất nhanh',
    delayMinMs: 30_000,
    delayMaxMs: 60_000,
  },
});

export const VALID_SEND_SPEED_KEYS = Object.freeze(['safe', 'fast', 'very_fast']);

/**
 * Suy ra tên mức tốc độ gửi từ giá trị dmin, dmax lưu trong DB.
 *
 * @param {number|string|null|undefined} dmin
 * @param {number|string|null|undefined} dmax
 * @returns {'safe' | 'fast' | 'very_fast' | 'custom'}
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
  if (min === 30_000 && max === 60_000) {
    return 'very_fast';
  }
  return 'custom';
}
