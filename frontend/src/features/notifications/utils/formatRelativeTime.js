const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Thời gian tương đối ("5 phút trước") bằng khoá `time.*` có sẵn trong từ điển.
 *
 * @param {string|number|Date|null|undefined} value
 * @param {(key: string, params?: object) => string} t
 * @param {number} [now] mốc "bây giờ" (ms) — tham số để test xác định được
 * @returns {string} chuỗi rỗng nếu `value` không phải thời điểm hợp lệ
 */
export function formatRelativeTime(value, t, now = Date.now()) {
  if (value == null || value === '') return '';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.max(0, Math.floor((now - time) / 1000));

  if (seconds < MINUTE) return t('time.justNow');
  if (seconds < HOUR) return t('time.minutesAgo', { n: Math.floor(seconds / MINUTE) });
  if (seconds < DAY) return t('time.hoursAgo', { n: Math.floor(seconds / HOUR) });
  if (seconds < WEEK) return t('time.daysAgo', { n: Math.floor(seconds / DAY) });
  if (seconds < MONTH) return t('time.weeksAgo', { n: Math.floor(seconds / WEEK) });
  if (seconds < YEAR) return t('time.monthsAgo', { n: Math.floor(seconds / MONTH) });
  return t('time.yearsAgo', { n: Math.floor(seconds / YEAR) });
}

export default formatRelativeTime;
