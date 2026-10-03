import { describe, it, expect } from 'vitest';
import { BUSINESS_HOURS, isWithinBusinessHours } from '../businessHours';

/**
 * H1 mục 2 (PLAN_SUA_AI_DOT3): giờ làm việc hotline = Thứ 2 – Thứ 6, 8:30 – 17:00.
 * Bản cũ của trang Liên hệ so `hour >= 8 && hour < 17` nên 8:00–8:29 vẫn hiện "Đang mở cửa".
 * Ngày dùng: 05/10/2026 là Thứ 2, 09/10/2026 là Thứ 6, 10/10/2026 là Thứ 7, 11/10/2026 là Chủ nhật (giờ địa phương, hàm tính theo giờ trình duyệt).
 */
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m, 0);

describe('isWithinBusinessHours — Thứ 2 – Thứ 6, 8:30 – 17:00', () => {
  it('hằng số: 8:30 → 510 phút, 17:00 → 1020 phút, Thứ 2–Thứ 6', () => {
    expect(BUSINESS_HOURS.startMinutes).toBe(510);
    expect(BUSINESS_HOURS.endMinutes).toBe(1020);
    expect([...BUSINESS_HOURS.days]).toEqual([1, 2, 3, 4, 5]);
  });

  it.each([
    ['Thứ 2 08:00', false, at(5, 8, 0)],
    ['Thứ 2 08:29', false, at(5, 8, 29)],
    ['Thứ 2 08:30', true, at(5, 8, 30)],
    ['Thứ 2 12:00', true, at(5, 12, 0)],
    ['Thứ 2 16:59', true, at(5, 16, 59)],
    ['Thứ 2 17:00', false, at(5, 17, 0)],
    ['Thứ 2 21:00 (giờ cũ 8:00-22:00)', false, at(5, 21, 0)],
    ['Thứ 6 09:00', true, at(9, 9, 0)],
    ['Thứ 7 10:00 (giờ cũ có làm Thứ 7)', false, at(10, 10, 0)],
    ['Chủ nhật 10:00', false, at(11, 10, 0)],
  ])('%s → mở cửa = %s', (_label, expected, date) => {
    expect(isWithinBusinessHours(date)).toBe(expected);
  });
});
