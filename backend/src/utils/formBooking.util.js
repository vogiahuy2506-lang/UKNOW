/**
 * Hàm thuần cho đặt lịch hẹn qua Form (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-2a).
 * Không đụng DB — mọi hàm nhận `now` để test được không phụ thuộc đồng hồ hệ thống.
 */

const VIETNAM_TZ = 'Asia/Ho_Chi_Minh';

function createBookingError(message, code = 'INVALID_APPOINTMENT_SLOT') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr;
}

function isValidTimeStr(timeStr) {
  return typeof timeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
}

/**
 * Thứ trong tuần (0 = Chủ nhật .. 6 = Thứ bảy) của một ngày YYYY-MM-DD, tính theo LỊCH của
 * chính ngày đó — KHÔNG dùng `new Date(dateStr).getDay()` vì kết quả phụ thuộc múi giờ máy chủ
 * chạy Node (ví dụ chạy TZ=UTC sẽ luôn đúng, nhưng CI/máy dev có thể đặt TZ khác).
 *
 * @param {string} dateStr YYYY-MM-DD
 * @returns {number} 0-6
 */
export function weekdayOf(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Ngày hôm nay theo lịch Việt Nam, dạng YYYY-MM-DD.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function todayVn(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VIETNAM_TZ }).format(now);
}

/**
 * Cộng/trừ N ngày lịch vào một chuỗi YYYY-MM-DD (không phụ thuộc múi giờ máy chủ — dùng
 * Date.UTC thuần để cộng ngày rồi đọc lại các phần UTC).
 *
 * @param {string} dateStr YYYY-MM-DD
 * @param {number} days có thể âm
 * @returns {string}
 */
export function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Thời điểm hẹn tuyệt đối (UTC) từ ngày+giờ theo lịch Việt Nam. VN không có giờ mùa hè nên
 * luôn cộng offset cố định +07:00 — không cần thư viện timezone.
 *
 * @param {string} date YYYY-MM-DD
 * @param {string} time HH:MM
 * @returns {Date}
 */
export function toAppointmentAt(date, time) {
  return new Date(`${date}T${time}:00+07:00`);
}

/**
 * Định dạng thời điểm hẹn cho người đọc (email), theo giờ Việt Nam.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatAppointmentVn(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // h23 = 0–23; hour12:false từng render nửa đêm thành "24"
  }).format(date);
}

/**
 * Kiểm một khung ngày+giờ có đặt được không theo cấu hình đặt lịch của form. Ném lỗi 400 (kèm
 * `.code`) khi không hợp lệ; trả `{ appointmentAt }` khi hợp lệ.
 *
 * @param {object} config bookingConfig đã normalize (enabled=true)
 * @param {string} date YYYY-MM-DD
 * @param {string} time HH:MM
 * @param {Date} [now]
 * @returns {{ appointmentAt: Date }}
 */
export function validateSlot(config, date, time, now = new Date()) {
  if (!config || !config.enabled) {
    throw createBookingError('Biểu mẫu này không bật đặt lịch hẹn', 'BOOKING_NOT_ENABLED');
  }
  if (!isValidDateStr(date) || !isValidTimeStr(time)) {
    throw createBookingError('Ngày hoặc giờ hẹn không hợp lệ');
  }

  const weekday = weekdayOf(date);
  const daySlots = (config.weeklySlots && config.weeklySlots[String(weekday)]) || [];
  if (!daySlots.includes(time)) {
    throw createBookingError('Khung giờ này không có trong lịch làm việc');
  }

  if (Array.isArray(config.closedDates) && config.closedDates.includes(date)) {
    throw createBookingError('Ngày này đã đóng, không nhận đặt lịch');
  }

  const appointmentAt = toAppointmentAt(date, time);
  const nowMs = now.getTime();
  if (appointmentAt.getTime() <= nowMs) {
    throw createBookingError('Khung giờ này đã qua');
  }

  const minNoticeMinutes = Number.isFinite(config.minNoticeMinutes) ? config.minNoticeMinutes : 60;
  const minNoticeMs = minNoticeMinutes * 60 * 1000;
  if (appointmentAt.getTime() - nowMs < minNoticeMs) {
    throw createBookingError(`Cần đặt trước ít nhất ${minNoticeMinutes} phút`);
  }

  const daysAhead = Number.isFinite(config.daysAhead) ? config.daysAhead : 30;
  const maxDate = addDaysToDateStr(todayVn(now), daysAhead);
  if (date > maxDate) {
    throw createBookingError('Ngày đặt vượt quá thời hạn cho phép đặt trước');
  }

  return { appointmentAt };
}

/**
 * Danh sách khung {date, time} hợp lệ trong `days` ngày kể từ `fromDate`, dùng cho API slots.
 * Dùng lại validateSlot làm nguồn duy nhất cho luật hợp lệ (đã qua/minNotice/daysAhead) — tránh
 * viết trùng điều kiện ở hai nơi rồi lệch nhau.
 *
 * @param {object} config bookingConfig đã normalize
 * @param {string} fromDate YYYY-MM-DD
 * @param {number} days
 * @param {Date} [now]
 * @returns {Array<{date: string, time: string}>}
 */
export function listSlotCandidates(config, fromDate, days, now = new Date()) {
  const candidates = [];
  if (!config || !config.enabled) return candidates;

  for (let i = 0; i < days; i += 1) {
    const dateStr = addDaysToDateStr(fromDate, i);
    const weekday = weekdayOf(dateStr);
    const daySlots = (config.weeklySlots && config.weeklySlots[String(weekday)]) || [];
    if (!daySlots.length) continue;

    for (const time of daySlots) {
      try {
        validateSlot(config, dateStr, time, now);
        candidates.push({ date: dateStr, time });
      } catch {
        // Không hợp lệ (ngày nghỉ/đã qua/minNotice/daysAhead) — bỏ qua khung này.
      }
    }
  }

  return candidates;
}
