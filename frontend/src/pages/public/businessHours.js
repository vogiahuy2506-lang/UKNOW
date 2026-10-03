/**
 * Giờ làm việc của đội hỗ trợ (hotline): Thứ 2 – Thứ 6, 8:30 – 17:00 GIỜ VIỆT NAM (sếp chốt 03/10/2026).
 *
 * MỘT nguồn cho logic "Đang mở cửa / Đã đóng cửa" của trang Liên hệ. Chữ hiển thị nằm ở i18n (`contact.workHours`,
 * `contact.statusOpenDetail`, `contact.statusClosedDetail`) và ở prompt tư vấn (backend `heroConsultation.service.js`
 * HERO_SUPPORT_HOURS) — đổi giờ thì đổi cả ba chỗ; `src/test/publicFalseClaims.spec.js` khoá các chuỗi.
 *
 * Tính theo giờ Việt Nam CỐ ĐỊNH (UTC+7 — Asia/Ho_Chi_Minh không có giờ mùa hè), KHÔNG theo múi giờ của trình duyệt: khách ở
 * múi giờ khác mở trang lúc nửa đêm ở Việt Nam không được thấy "Đang mở cửa", và ngược lại. Bản đầu đọc giờ địa phương của
 * trình duyệt nên trạng thái sai với mọi khách ngoài múi giờ +7.
 */
export const VIETNAM_UTC_OFFSET_MINUTES = 7 * 60;

export const BUSINESS_HOURS = Object.freeze({
  /** 1 = Thứ 2 … 5 = Thứ 6 (cùng quy ước Date#getDay). */
  days: Object.freeze([1, 2, 3, 4, 5]),
  /** 8:30 */
  startMinutes: 8 * 60 + 30,
  /** 17:00 (không tính phút 17:00 trở đi). */
  endMinutes: 17 * 60,
});

/**
 * Đồng hồ treo tường ở Việt Nam tại thời điểm `now` (không phụ thuộc múi giờ máy).
 *
 * @param {Date} [now]
 * @returns {{ day: number, hour: number, minute: number, timeStr: string }} `day` 0 = Chủ nhật … 6 = Thứ 7; `timeStr` dạng "HH:MM"
 */
export function getVietnamClock(now = new Date()) {
  // Dịch mốc thời gian +7 giờ rồi đọc bằng getter UTC: kết quả chính là giờ treo tường ở Việt Nam.
  const shifted = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MINUTES * 60 * 1000);
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  return {
    day: shifted.getUTCDay(),
    hour,
    minute,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

/**
 * @param {Date} [now]
 * @returns {boolean} đang trong giờ làm việc (mở từ 8:30 đến trước 17:00, Thứ 2 – Thứ 6, giờ Việt Nam)
 */
export function isWithinBusinessHours(now = new Date()) {
  const { day, hour, minute } = getVietnamClock(now);
  if (!BUSINESS_HOURS.days.includes(day)) return false;
  const minutes = hour * 60 + minute;
  return minutes >= BUSINESS_HOURS.startMinutes && minutes < BUSINESS_HOURS.endMinutes;
}
