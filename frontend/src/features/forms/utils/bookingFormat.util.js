/**
 * Tiện ích định dạng ngày/giờ cho tính năng đặt lịch (PR-2b).
 *
 * Bẫy múi giờ (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-2b):
 * - Ngày dạng YYYY-MM-DD KHÔNG được parse bằng `new Date(dateStr)` (dùng múi giờ trình duyệt) —
 *   khách ở múi giờ âm (vd. America/New_York) sẽ thấy lùi một ngày. Luôn ghép `T00:00:00Z` và
 *   format với `timeZone: 'UTC'`.
 * - Giờ hẹn tuyệt đối (ISO timestamp) luôn hiển thị theo `timeZone: 'Asia/Ho_Chi_Minh'`, không
 *   bao giờ theo múi giờ trình duyệt.
 */

const LOCALE_MAP = { vi: 'vi-VN', en: 'en-US' };

function resolveIntlLocale(locale) {
  return LOCALE_MAP[locale] || 'vi-VN';
}

/** "Hôm nay" theo giờ Việt Nam, dạng YYYY-MM-DD — không phụ thuộc múi giờ máy khách. */
export function vnToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(now);
}

/** Cộng/trừ N ngày vào chuỗi YYYY-MM-DD, tính theo lịch UTC (an toàn múi giờ). */
export function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Nhãn ngày hiển thị (vd. "CN, 20/09") từ chuỗi YYYY-MM-DD.
 * BẮT BUỘC dùng timeZone: 'UTC' — không được `new Date(dateStr)` trần.
 */
export function formatSlotDateLabel(dateStr, locale = 'vi') {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * Định dạng giờ hẹn tuyệt đối (ISO string, cột appointmentAt) theo giờ Việt Nam.
 * BẮT BUỘC dùng timeZone: 'Asia/Ho_Chi_Minh' — không được phụ thuộc múi giờ trình duyệt.
 */
export function formatAppointmentAtVn(isoString, locale = 'vi') {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 = 0–23; hour12:false không đáng tin ở mọi locale — en-US + hour12:false render
    // nửa đêm thành "24:30" (đo trên Node 20.19.6), khớp bẫy backend đã vá ở formBooking.util.js.
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(d);
}
