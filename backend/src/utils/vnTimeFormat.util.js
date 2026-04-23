/**
 * Định dạng thời gian cho log vận hành: luôn hiển thị cùng lúc UTC (ISO Z) và giờ Việt Nam.
 * Dùng timeZone cố định Asia/Ho_Chi_Minh — không phụ thuộc biến TZ của process Node hay múi giờ OS.
 */

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Parse input sang Date hợp lệ (epoch / ISO / đối tượng Date từ pg).
 *
 * @param {Date|string|number|null|undefined} input
 * @returns {Date|null}
 */
function toDateOrNull(input) {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input : null;
  }
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Một dòng log: ISO UTC + cùng mốc theo lịch Việt Nam (24h).
 *
 * @param {Date|string|number|null|undefined} input
 * @returns {string}
 */
export function formatUtcAndVietnamForLog(input) {
  const d = toDateOrNull(input);
  if (!d) return '(thời điểm không hợp lệ)';
  const utcIso = d.toISOString();
  const vnWall = new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
  return `${utcIso} (giờ VN: ${vnWall})`;
}
