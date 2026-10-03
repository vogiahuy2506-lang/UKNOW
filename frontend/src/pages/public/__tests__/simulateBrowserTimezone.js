import { vi } from 'vitest';

/**
 * Giả lập trình duyệt ở múi giờ UTC+`offsetHours` bất kể máy chạy test đang ở múi giờ nào: ghi đè ba getter GIỜ ĐỊA PHƯƠNG của Date
 * (getDay / getHours / getMinutes) để trả đúng giá trị của múi giờ đó. Mã tính giờ đúng (đọc getter UTC sau khi cộng +7) không bị ảnh
 * hưởng; mã còn đọc giờ trình duyệt sẽ ra sai ngay — kể cả khi máy dev đang ở +7 (nơi giờ máy trùng giờ Việt Nam nên lỗi không lộ).
 * Gỡ bằng `vi.restoreAllMocks()`.
 *
 * @param {number} offsetHours ví dụ -5 (New York), 13 (New Zealand), 0 (UTC)
 */
export function simulateBrowserTimezone(offsetHours) {
  const shiftMs = offsetHours * 60 * 60 * 1000;
  const localParts = (date) => new Date(date.getTime() + shiftMs);
  vi.spyOn(Date.prototype, 'getDay').mockImplementation(function getDay() {
    return localParts(this).getUTCDay();
  });
  vi.spyOn(Date.prototype, 'getHours').mockImplementation(function getHours() {
    return localParts(this).getUTCHours();
  });
  vi.spyOn(Date.prototype, 'getMinutes').mockImplementation(function getMinutes() {
    return localParts(this).getUTCMinutes();
  });
}
