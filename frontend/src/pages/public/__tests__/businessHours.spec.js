import { describe, it, expect, afterEach, vi } from 'vitest';
import { BUSINESS_HOURS, VIETNAM_UTC_OFFSET_MINUTES, getVietnamClock, isWithinBusinessHours } from '../businessHours';
import { simulateBrowserTimezone } from './simulateBrowserTimezone';

/**
 * H1 mục 2 + vòng 2 (PLAN_SUA_AI_DOT3): giờ làm việc hotline = Thứ 2 – Thứ 6, 8:30 – 17:00 GIỜ VIỆT NAM (UTC+7 cố định),
 * không theo múi giờ trình duyệt. Mốc thời gian dựng bằng Date.UTC (05/10/2026 là Thứ 2, 09/10 Thứ 6, 10/10 Thứ 7, 11/10 Chủ nhật),
 * và mỗi ca chạy lại với trình duyệt giả ở nhiều múi giờ — kết quả phải KHÔNG đổi.
 */
/** Mốc ứng với giờ treo tường `h:m` ở Việt Nam ngày `day`/10/2026. */
const vn = (day, h, m = 0) => new Date(Date.UTC(2026, 9, day, h - 7, m, 0));
const utc = (day, h, m = 0) => new Date(Date.UTC(2026, 9, day, h, m, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hằng số', () => {
  it('8:30 → 510 phút, 17:00 → 1020 phút, Thứ 2–Thứ 6, UTC+7', () => {
    expect(BUSINESS_HOURS.startMinutes).toBe(510);
    expect(BUSINESS_HOURS.endMinutes).toBe(1020);
    expect([...BUSINESS_HOURS.days]).toEqual([1, 2, 3, 4, 5]);
    expect(VIETNAM_UTC_OFFSET_MINUTES).toBe(420);
  });
});

const TABLE = [
  ['Thứ 2 08:00', false, vn(5, 8, 0)],
  ['Thứ 2 08:29', false, vn(5, 8, 29)],
  ['Thứ 2 08:30', true, vn(5, 8, 30)],
  ['Thứ 2 12:00', true, vn(5, 12, 0)],
  ['Thứ 2 16:59', true, vn(5, 16, 59)],
  ['Thứ 2 17:00', false, vn(5, 17, 0)],
  ['Thứ 2 21:00 (giờ cũ 8:00-22:00)', false, vn(5, 21, 0)],
  ['Thứ 6 09:00', true, vn(9, 9, 0)],
  ['Thứ 7 10:00 (giờ cũ có làm Thứ 7)', false, vn(10, 10, 0)],
  ['Chủ nhật 10:00', false, vn(11, 10, 0)],
];

describe.each([
  ['máy ở UTC', 0],
  ['trình duyệt ở New York (UTC-5)', -5],
  ['trình duyệt ở Los Angeles (UTC-8)', -8],
  ['trình duyệt ở Tokyo (UTC+9)', 9],
  ['trình duyệt ở New Zealand (UTC+13)', 13],
])('isWithinBusinessHours — Thứ 2 – Thứ 6, 8:30 – 17:00 giờ VN (%s)', (_zone, offsetHours) => {
  it.each(TABLE)('%s → mở cửa = %s', (_label, expected, date) => {
    simulateBrowserTimezone(offsetHours);
    expect(isWithinBusinessHours(date)).toBe(expected);
  });
});

describe('giờ Việt Nam, không phải giờ trình duyệt', () => {
  it('03:00 UTC Thứ 2 = 10:00 VN → ĐANG MỞ, dù trình duyệt ở UTC-5 chỉ thấy Chủ nhật 22:00', () => {
    simulateBrowserTimezone(-5);
    const now = utc(5, 3, 0);
    expect(new Date(now).getDay()).toBe(0); // giả lập đúng: giờ máy là Chủ nhật
    expect(isWithinBusinessHours(now)).toBe(true);
    expect(getVietnamClock(now)).toEqual({ day: 1, hour: 10, minute: 0, timeStr: '10:00' });
  });

  it('00:00 UTC Thứ 2 = 07:00 VN → ĐÓNG, dù trình duyệt ở UTC+13 thấy Thứ 2 13:00', () => {
    simulateBrowserTimezone(13);
    const now = utc(5, 0, 0);
    expect(new Date(now).getHours()).toBe(13);
    expect(isWithinBusinessHours(now)).toBe(false);
  });

  it('09:00 UTC Thứ 6 = 16:00 VN → ĐANG MỞ, dù trình duyệt ở UTC-5 thấy 04:00', () => {
    simulateBrowserTimezone(-5);
    expect(isWithinBusinessHours(utc(9, 9, 0))).toBe(true);
  });

  it('02:00 UTC Thứ 7 = 09:00 Thứ 7 VN → ĐÓNG, dù trình duyệt ở UTC-5 thấy Thứ 6 21:00', () => {
    simulateBrowserTimezone(-5);
    expect(isWithinBusinessHours(utc(10, 2, 0))).toBe(false);
  });

  it('20:00 UTC Chủ nhật = 03:00 Thứ 2 VN: đồng hồ VN đã sang Thứ 2 nhưng chưa tới 8:30 → ĐÓNG', () => {
    const clock = getVietnamClock(utc(4, 20, 0));
    expect(clock.day).toBe(1);
    expect(clock.timeStr).toBe('03:00');
    expect(isWithinBusinessHours(utc(4, 20, 0))).toBe(false);
  });

  it('timeStr luôn là giờ VN dạng HH:MM, qua nửa đêm đổi ngày đúng', () => {
    expect(getVietnamClock(utc(5, 16, 59))).toEqual({ day: 1, hour: 23, minute: 59, timeStr: '23:59' });
    expect(getVietnamClock(utc(5, 17, 0))).toEqual({ day: 2, hour: 0, minute: 0, timeStr: '00:00' });
    expect(getVietnamClock(utc(5, 1, 5)).timeStr).toBe('08:05');
  });
});
