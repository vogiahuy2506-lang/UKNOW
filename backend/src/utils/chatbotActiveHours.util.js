/**
 * Tiện ích xử lý cấu hình và tính toán khung giờ hoạt động của Chatbot.
 * Múi giờ chuẩn: Việt Nam (UTC+7).
 *
 * Cấu hình active_hours dạng:
 * {
 *   days: [1, 2, 3, 4, 5], // 0 = Chủ Nhật, 1 = Thứ 2, ..., 6 = Thứ 7. NULL/omitted = Tất cả 7 ngày
 *   slots: [
 *     { start: "08:00", end: "12:00" },
 *     { start: "18:00", end: "05:00" } // Cho phép qua đêm
 *   ],
 *   start: "08:00", // Tương thích ngược (lấy theo slots[0])
 *   end: "12:00",
 *   outsideAction: "silent" | "message",
 *   outsideMessage: "Hiện ngoài giờ hỗ trợ..."
 * }
 * NULL = Luôn trả lời (24/7).
 */

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_OUTSIDE_MESSAGE_LENGTH = 500;
export const MAX_SLOTS_PER_DAY = 5;
export const CHATBOT_ACTIVE_HOURS_ACTIONS = Object.freeze(['silent', 'message']);
export const DEFAULT_ACTIVE_HOURS_DAYS = Object.freeze([1, 2, 3, 4, 5, 6, 0]); // Thứ 2 -> Chủ Nhật

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
 * Chuyển HH:MM thành số phút trong ngày (0 - 1439).
 * @param {string} timeStr
 * @returns {number}
 */
export function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Kiểm tra xem 2 khung giờ hoạt động trong ngày có bị trùng lấn nhau hay không.
 * Xử lý chính xác cả khung giờ cùng ngày và khung giờ qua đêm.
 *
 * @param {{ start: string, end: string }} slotA
 * @param {{ start: string, end: string }} slotB
 * @returns {boolean}
 */
export function doSlotsOverlap(slotA, slotB) {
  const aStart = parseTimeToMinutes(slotA.start);
  const aEnd = parseTimeToMinutes(slotA.end);
  const bStart = parseTimeToMinutes(slotB.start);
  const bEnd = parseTimeToMinutes(slotB.end);

  const aIntervals = aStart < aEnd
    ? [[aStart, aEnd]]
    : [[aStart, 1440], [0, aEnd]];

  const bIntervals = bStart < bEnd
    ? [[bStart, bEnd]]
    : [[bStart, 1440], [0, bEnd]];

  for (const [a1, a2] of aIntervals) {
    for (const [b1, b2] of bIntervals) {
      if (Math.max(a1, b1) < Math.min(a2, b2)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Chuẩn hoá cấu hình active_hours.
 * Hỗ trợ cả định dạng cũ (start, end) và định dạng mới (days, slots).
 *
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

  // 1. Chuẩn hoá danh sách ngày trong tuần
  let days = DEFAULT_ACTIVE_HOURS_DAYS;
  if (raw.days !== undefined) {
    if (!Array.isArray(raw.days)) {
      if (strict) throw new ActiveHoursValidationError('Danh sách ngày áp dụng phải là mảng');
      return null;
    }
    const cleanDays = [...new Set(raw.days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (cleanDays.length === 0) {
      if (strict) throw new ActiveHoursValidationError('Vui lòng chọn ít nhất một ngày trong tuần');
      return null;
    }
    days = cleanDays;
  }

  // 2. Chuẩn hoá danh sách ca (slots)
  let rawSlots = [];
  if (Array.isArray(raw.slots)) {
    rawSlots = raw.slots;
  } else if (raw.start !== undefined || raw.end !== undefined) {
    rawSlots = [{ start: raw.start, end: raw.end }];
  } else {
    if (strict) throw new ActiveHoursValidationError('Vui lòng cấu hình khung giờ hoạt động');
    return null;
  }

  if (rawSlots.length === 0) {
    if (strict) throw new ActiveHoursValidationError('Vui lòng cấu hình ít nhất một khung giờ hoạt động');
    return null;
  }

  if (rawSlots.length > MAX_SLOTS_PER_DAY) {
    if (strict) throw new ActiveHoursValidationError(`Tối đa ${MAX_SLOTS_PER_DAY} khung giờ hoạt động trong ngày`);
    return null;
  }

  const slots = [];
  for (let i = 0; i < rawSlots.length; i++) {
    const item = rawSlots[i];
    if (!item || typeof item !== 'object') {
      if (strict) throw new ActiveHoursValidationError('Khung giờ không hợp lệ');
      return null;
    }
    const start = padTimeStr(item.start);
    const end = padTimeStr(item.end);

    if (!TIME_REGEX.test(start) || !TIME_REGEX.test(end)) {
      if (strict) throw new ActiveHoursValidationError('Giờ bắt đầu và kết thúc phải có định dạng HH:MM (00:00 - 23:59)');
      return null;
    }

    if (start === end) {
      if (strict) throw new ActiveHoursValidationError('Giờ bắt đầu và kết thúc không được trùng nhau');
      return null;
    }

    slots.push({ start, end });
  }

  // Kiểm tra không trùng lấn giữa các ca
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (doSlotsOverlap(slots[i], slots[j])) {
        if (strict) throw new ActiveHoursValidationError('Các khung giờ hoạt động trong ngày không được trùng lấn nhau');
        return null;
      }
    }
  }

  // 3. Chuẩn hoá hành vi ngoài giờ
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
    days,
    slots,
    start: slots[0].start,
    end: slots[0].end,
    outsideAction,
    outsideMessage: outsideAction === 'message' ? outsideMessage.slice(0, MAX_OUTSIDE_MESSAGE_LENGTH) : '',
  };
}

/**
 * Lấy các thành phần ngày giờ tại múi giờ Việt Nam (UTC+7).
 * @param {Date|string|number} now
 * @returns {{ year: number, month: number, day: number, dayOfWeek: number, hours: number, minutes: number, totalMinutes: number }}
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
    dayOfWeek: vnDate.getUTCDay(), // 0 = Chủ Nhật, 1 = Thứ 2, ..., 6 = Thứ 7
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
  };
}

/**
 * Kiểm tra xem thời điểm hiện tại có nằm trong khung giờ hoạt động hay không.
 * Hỗ trợ đa ca trong ngày, nhiều ngày trong tuần và ca vắt qua đêm.
 *
 * @param {object|null|undefined} config - Cấu hình đã qua hoặc chưa qua normalize
 * @param {Date|string|number} [now=new Date()]
 * @returns {boolean}
 */
export function isWithinActiveHours(config, now = new Date()) {
  if (!config) return true;

  const days = Array.isArray(config.days) && config.days.length > 0
    ? config.days
    : DEFAULT_ACTIVE_HOURS_DAYS;

  const slots = Array.isArray(config.slots) && config.slots.length > 0
    ? config.slots
    : (config.start && config.end ? [{ start: config.start, end: config.end }] : []);

  if (slots.length === 0) return true;

  const { dayOfWeek, totalMinutes } = getVietnamDateTimeParts(now);

  // Trường hợp 1: Ca bắt đầu trong ngày hôm nay (today)
  if (days.includes(dayOfWeek)) {
    for (const slot of slots) {
      const startMinutes = parseTimeToMinutes(slot.start);
      const endMinutes = parseTimeToMinutes(slot.end);

      if (startMinutes < endMinutes) {
        // Trong cùng ngày: ví dụ 08:00 - 17:30
        if (totalMinutes >= startMinutes && totalMinutes < endMinutes) {
          return true;
        }
      } else if (startMinutes > endMinutes) {
        // Vắt qua nửa đêm: phần buổi tối hôm nay (start -> 23:59)
        if (totalMinutes >= startMinutes) {
          return true;
        }
      }
    }
  }

  // Trường hợp 2: Ca vắt qua nửa đêm bắt đầu từ ngày hôm qua (yesterday)
  const yesterdayOfWeek = (dayOfWeek + 6) % 7;
  if (days.includes(yesterdayOfWeek)) {
    for (const slot of slots) {
      const startMinutes = parseTimeToMinutes(slot.start);
      const endMinutes = parseTimeToMinutes(slot.end);

      if (startMinutes > endMinutes) {
        // Vắt qua nửa đêm: phần rạng sáng hôm nay (00:00 -> end)
        if (totalMinutes < endMinutes) {
          return true;
        }
      }
    }
  }

  return false;
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
  if (!config) return null;

  const days = Array.isArray(config.days) && config.days.length > 0
    ? config.days
    : DEFAULT_ACTIVE_HOURS_DAYS;

  const slots = Array.isArray(config.slots) && config.slots.length > 0
    ? config.slots
    : (config.start && config.end ? [{ start: config.start, end: config.end }] : []);

  if (slots.length === 0) return null;

  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
  let latestEndMs = -Infinity;

  const { year, month, day, dayOfWeek } = getVietnamDateTimeParts(now);

  for (let offset = 0; offset <= 7; offset++) {
    const candidateDayOfWeek = (dayOfWeek - offset + 70) % 7;
    if (!days.includes(candidateDayOfWeek)) continue;

    for (const slot of slots) {
      const sMin = parseTimeToMinutes(slot.start);
      const eMin = parseTimeToMinutes(slot.end);
      const endHour = Math.floor(eMin / 60);
      const endMinute = eMin % 60;

      // Nếu ca qua đêm (sMin > eMin): bắt đầu tại candidateDay, nhưng kết thúc tại candidateDay + 1
      const dayShift = sMin > eMin ? 1 : 0;
      const targetDayOffset = -offset + dayShift;

      const candidateEndUtcMs = Date.UTC(year, month, day + targetDayOffset, endHour - 7, endMinute);

      if (candidateEndUtcMs <= nowMs && candidateEndUtcMs > latestEndMs) {
        latestEndMs = candidateEndUtcMs;
      }
    }
  }

  return latestEndMs > -Infinity ? new Date(latestEndMs) : null;
}

