/**
 * Giờ làm việc của đội hỗ trợ (hotline): Thứ 2 – Thứ 6, 8:30 – 17:00 (sếp chốt 03/10/2026).
 *
 * MỘT nguồn cho logic "Đang mở cửa / Đã đóng cửa" của trang Liên hệ. Chữ hiển thị nằm ở i18n (`contact.workHours`,
 * `contact.statusOpenDetail`, `contact.statusClosedDetail`) và ở prompt tư vấn (backend `heroConsultation.service.js`
 * HERO_SUPPORT_HOURS) — đổi giờ thì đổi cả ba chỗ; `src/test/publicFalseClaims.spec.js` khoá các chuỗi.
 *
 * Tính theo giờ của trình duyệt (như bản cũ: `now.getHours()`), không đổi sang múi giờ khác ở đây.
 */
export const BUSINESS_HOURS = Object.freeze({
  /** 1 = Thứ 2 … 5 = Thứ 6 (Date#getDay). */
  days: Object.freeze([1, 2, 3, 4, 5]),
  /** 8:30 */
  startMinutes: 8 * 60 + 30,
  /** 17:00 (không tính phút 17:00 trở đi). */
  endMinutes: 17 * 60,
});

/**
 * @param {Date} [now]
 * @returns {boolean} đang trong giờ làm việc (mở từ 8:30 đến trước 17:00, Thứ 2 – Thứ 6)
 */
export function isWithinBusinessHours(now = new Date()) {
  if (!BUSINESS_HOURS.days.includes(now.getDay())) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= BUSINESS_HOURS.startMinutes && minutes < BUSINESS_HOURS.endMinutes;
}
