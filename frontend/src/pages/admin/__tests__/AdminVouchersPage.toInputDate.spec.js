/**
 * toInputDate phải đổi ISO UTC sang ngày theo giờ VN, đúng bất kể múi giờ máy chạy test.
 * Bản cũ slice(0,10) làm startsAt lùi 1 ngày mỗi lần mở sửa rồi Lưu.
 */
import { describe, it, expect } from 'vitest';
import { toInputDate } from '../../../utils/voucherDate.util.js';

describe('voucherDate toInputDate', () => {
  it('startsAt 00:00 +07 (17:00Z hôm trước) -> đúng ngày VN', () => {
    expect(toInputDate('2026-09-30T17:00:00.000Z')).toBe('2026-10-01');
  });
  it('endsAt 23:59:59 +07 (16:59Z cùng ngày) -> giữ ngày', () => {
    expect(toInputDate('2026-10-01T16:59:59.000Z')).toBe('2026-10-01');
  });
  it('rỗng -> chuỗi rỗng', () => {
    expect(toInputDate(null)).toBe('');
    expect(toInputDate('')).toBe('');
  });
});
