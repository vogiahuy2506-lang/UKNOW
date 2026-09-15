/**
 * Tiện ích xử lý cấu hình và tính toán khung giờ hoạt động của Chatbot.
 * Múi giờ chuẩn: Việt Nam (UTC+7).
 *
 * Cấu hình active_hours dạng:
 * {
 *   start: "18:00",
 *   end: "05:00",
 *   outsideAction: "silent" | "message",
 *   outsideMessage: "Hiện ngoài giờ hỗ trợ..."
 * }
 * NULL = Luôn trả lời (24/7).
 */

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_OUTSIDE_MESSAGE_LENGTH = 500;
export const CHATBOT_ACTIVE_HOURS_ACTIONS = Object.freeze(['silent', 'message']);

export class ActiveHoursValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ActiveHoursValidationError';
  }
}

function padTimeStr(str) {
  const s = String(str || '').trim();
  const parts = s.split(':');
  if (parts.length !== 2) return s;
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Chuẩn hoá cấu hình active_hours.
 * @param {object|null|undefined} raw
 * @param {object} [options]
 * @param {boolean} [options.strict=true] - Mặc định true để validate chặt chẽ
 * @returns {object|null}
 */
export function normalizeChatbotActiveHours(raw, { strict = true } = {}) {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    if (strict) throw new ActiveHoursValidationError('Cấu hình khung giờ chatbot không hợp lệ');
    return null;
  }

  const start = padTimeStr(raw.start);
  const end = padTimeStr(raw.end);

  if (!TIME_REGEX.test(start) || !TIME_REGEX.test(end)) {
    if (strict) throw new ActiveHoursValidationError('Giờ bắt đầu và kết thúc phải có định dạng HH:MM (00:00 - 23:59)');
    return null;
  }

  if (start === end) {
    if (strict) throw new ActiveHoursValidationError('Giờ bắt đầu và kết thúc không được trùng nhau');
    return null;
  }

  if (strict && raw.outsideAction !== undefined && !CHATBOT_ACTIVE_HOURS_ACTIONS.includes(raw.outsideAction)) {
    throw new ActiveHoursValidationError('Hành vi ngoài khung giờ phải là silent hoặc message');
  }

  const outsideAction = CHATBOT_ACTIVE_HOURS_ACTIONS.includes(raw.outsideAction)
    ? raw.outsideAction
    : 'silent';

  const outsideMessage = String(raw.outsideMessage || '').trim();

  if (outsideAction === 'message') {
    if (!outsideMessage) {
      if (strict) throw new ActiveHoursValidationError('Vui lòng nhập câu trả lời ngoài khung giờ');
      return null;
    }
    if (outsideMessage.length > MAX_OUTSIDE_MESSAGE_LENGTH) {
      if (strict) throw new ActiveHoursValidationError(`Câu trả lời ngoài khung giờ không được vượt quá ${MAX_OUTSIDE_MESSAGE_LENGTH} ký tự`);
      return null;
    }
  }

  return {
    start,
    end,
    outsideAction,
    outsideMessage: outsideAction === 'message' ? outsideMessage.slice(0, MAX_OUTSIDE_MESSAGE_LENGTH) : '',
  };
}

/**
 * Chuyển HH:MM thành số phút trong ngày (0 - 1439).
 * @param {string} timeStr
 * @returns {number}
 */
export function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Lấy các thành phần ngày giờ tại múi giờ Việt Nam (UTC+7).
 * @param {Date|string|number} now
 * @returns {{ year: number, month: number, day: number, hours: number, minutes: number, totalMinutes: number }}
 */
export function getVietnamDateTimeParts(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  // UTC ms + 7 giờ
  const vnMs = date.getTime() + 7 * 3600 * 1000;
  const vnDate = new Date(vnMs);
  const hours = vnDate.getUTCHours();
  const minutes = vnDate.getUTCMinutes();
  return {
    year: vnDate.getUTCFullYear(),
    month: vnDate.getUTCMonth(), // 0-11
    day: vnDate.getUTCDate(),
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
  };
}

/**
 * Kiểm tra xem thời điểm hiện tại có nằm trong khung giờ hoạt động hay không.
 * @param {object|null|undefined} config - Cấu hình đã qua hoặc chưa qua normalize
 * @param {Date|string|number} [now=new Date()]
 * @returns {boolean}
 */
export function isWithinActiveHours(config, now = new Date()) {
  if (!config) return true;

  const startMinutes = parseTimeToMinutes(config.start);
  const endMinutes = parseTimeToMinutes(config.end);
  const { totalMinutes } = getVietnamDateTimeParts(now);

  if (startMinutes < endMinutes) {
    // Trong cùng ngày: ví dụ 08:00 - 17:30
    return totalMinutes >= startMinutes && totalMinutes < endMinutes;
  }

  if (startMinutes > endMinutes) {
    // Vắt qua nửa đêm: ví dụ 18:00 - 05:00
    return totalMinutes >= startMinutes || totalMinutes < endMinutes;
  }

  return true;
}

/**
 * Tính mốc bắt đầu của đợt ngoài giờ gần nhất tính tới thời điểm `now` (theo giờ VN).
 * Mốc này chính là thời điểm `end` của khung giờ hoạt động gần nhất trong quá khứ.
 * Dùng để tạo khoá đệm 1 lần / đợt ngoài giờ.
 *
 * @param {object} config
 * @param {Date|string|number} [now=new Date()]
 * @returns {Date|null}
 */
export function currentOutsideWindowStart(config, now = new Date()) {
  if (!config?.end) return null;

  const { year, month, day, totalMinutes } = getVietnamDateTimeParts(now);
  const endMinutes = parseTimeToMinutes(config.end);
  const endHour = Math.floor(endMinutes / 60);
  const endMin = endMinutes % 60;

  // Candidate hôm nay tại giờ VN: (year, month, day, endHour, endMin) theo UTC+7
  // Thời điểm này tương ứng UTC: Date.UTC(year, month, day, endHour - 7, endMin)
  const candidateTodayUtcMs = Date.UTC(year, month, day, endHour - 7, endMin);

  if (totalMinutes >= endMinutes) {
    return new Date(candidateTodayUtcMs);
  }

  // Nếu hiện tại chưa chạm tới endHour:endMin hôm nay,
  // mốc end gần nhất là của ngày hôm qua
  const candidateYesterdayUtcMs = Date.UTC(year, month, day - 1, endHour - 7, endMin);
  return new Date(candidateYesterdayUtcMs);
}
