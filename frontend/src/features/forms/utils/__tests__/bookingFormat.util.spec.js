import { describe, it, expect } from 'vitest';
import {
  formatSlotDateLabel,
  formatAppointmentAtVn,
  vnToday,
  addDaysToDateStr,
} from '../bookingFormat.util';

// Máy dev chạy ở +7 (Asia/Saigon) trùng giờ Việt Nam nên KHÔNG bắt được lỗi dùng múi giờ trình
// duyệt thay vì timeZone cố định. Đột biến #3/#4 (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md,
// PR-2b) bắt buộc chạy dưới `TZ=America/New_York npx vitest run <file>` mới lộ ra.
describe('bookingFormat.util - an toàn múi giờ', () => {
  it('formatSlotDateLabel("2026-09-20") luôn ra Chủ nhật 20/09, kể cả dưới TZ=America/New_York', () => {
    const label = formatSlotDateLabel('2026-09-20', 'vi');
    expect(label).toContain('20/09');
    expect(label).toMatch(/CN|Ch[ủu] nh[ậa]t/i);
  });

  it('formatSlotDateLabel trả rỗng với chuỗi ngày không hợp lệ, không ném lỗi', () => {
    expect(formatSlotDateLabel('not-a-date', 'vi')).toBe('');
    expect(formatSlotDateLabel('', 'vi')).toBe('');
    expect(formatSlotDateLabel(undefined, 'vi')).toBe('');
  });

  it('formatAppointmentAtVn("2026-09-19T17:30:00.000Z") luôn ra 00:30 20/09/2026 theo giờ VN, kể cả dưới TZ=America/New_York', () => {
    const formatted = formatAppointmentAtVn('2026-09-19T17:30:00.000Z', 'vi');
    expect(formatted).toContain('00:30');
    expect(formatted).toContain('20/09/2026');
  });

  it('vnToday trả chuỗi YYYY-MM-DD hợp lệ theo giờ VN', () => {
    const today = vnToday(new Date('2026-09-14T20:00:00.000Z'));
    // 20:00 UTC == 03:00 sáng hôm sau giờ VN (+7)
    expect(today).toBe('2026-09-15');
  });

  it('addDaysToDateStr cộng ngày theo lịch UTC, không lệch do giờ mùa hè/múi giờ', () => {
    expect(addDaysToDateStr('2026-09-14', 7)).toBe('2026-09-21');
    expect(addDaysToDateStr('2026-09-01', -1)).toBe('2026-08-31');
  });
});
