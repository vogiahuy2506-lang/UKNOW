const HANOI_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const ISO_LIKE_DATETIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?(?:Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parse chuỗi ngày giờ theo "giờ tường" để tránh cộng lệch timezone.
 *
 * Luồng hoạt động:
 * 1. Chỉ áp dụng cho chuỗi dạng `YYYY-MM-DD HH:mm:ss` hoặc ISO tương đương.
 * 2. Nếu chuỗi có hậu tố timezone (`Z`, `+07:00`...), hàm vẫn cố ý bỏ qua hậu tố.
 * 3. Dựng Date theo local-time của trình duyệt để giữ đúng giờ hiển thị nghiệp vụ.
 *
 * @param {string} value chuỗi thời gian đầu vào
 * @returns {Date|null} Date hợp lệ hoặc null nếu không parse được
 */
const parseCampaignWallClockDate = (value) => {
  if (typeof value !== 'string') return null;
  const normalizedValue = value.trim();
  if (!normalizedValue) return null;
  const matched = normalizedValue.match(ISO_LIKE_DATETIME_REGEX);
  if (!matched) return null;

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);
  const hour = Number.parseInt(matched[4], 10);
  const minute = Number.parseInt(matched[5], 10);
  const second = Number.parseInt(matched[6] || '0', 10);
  const millisecond = Number.parseInt((matched[7] || '0').padEnd(3, '0'), 10);
  const parsedDate = new Date(year, month - 1, day, hour, minute, second, millisecond);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

/**
 * Chuẩn hóa giá trị thời gian về Date hợp lệ cho màn hình Campaign.
 *
 * @param {string|number|Date|null|undefined} value giá trị thời gian đầu vào
 * @returns {Date|null} Date hợp lệ hoặc null
 */
const toCampaignDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const wallClockDate = parseCampaignWallClockDate(value);
    if (wallClockDate) return wallClockDate;
  }
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

/**
 * Format date-time value for campaign screens with fixed Hanoi timezone.
 *
 * @param {string|number|Date|null|undefined} value input date value
 * @param {string} fallback fallback text when value is invalid
 * @returns {string}
 */
export const formatCampaignDateTime = (value, fallback = '-') => {
  const date = toCampaignDate(value);
  if (!date) return fallback;
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
  const date = toCampaignDate(value);
  if (!date) return fallback;
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

