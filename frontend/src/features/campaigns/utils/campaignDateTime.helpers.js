const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Format date-time value for campaign screens with fixed Hanoi timezone.
 *
 * @param {string|number|Date|null|undefined} value input date value
 * @param {string} fallback fallback text when value is invalid
 * @returns {string}
 */
export const formatCampaignDateTime = (value, fallback = '-') => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('vi-VN', {
    hour12: false,
    timeZone: HANOI_TIME_ZONE,
  });
};

/**
 * Format time-only value theo múi giờ UTC+7 cho phần log.
 *
 * @param {string|number|Date|null|undefined} value giá trị thời gian đầu vào
 * @param {string} fallback text fallback khi value không hợp lệ
 * @returns {string}
 */
export const formatCampaignTime = (value, fallback = '-') => {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleTimeString('vi-VN', {
    hour12: false,
    timeZone: HANOI_TIME_ZONE,
  });
};

/**
 * Build yyyy-mm-dd string based on Hanoi timezone for input[type="date"] min.
 *
 * @returns {string}
 */
export const getTodayDateInHanoiForInput = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: HANOI_TIME_ZONE,
  }).formatToParts(new Date());
  const getPart = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  return `${year}-${month}-${day}`;
};

