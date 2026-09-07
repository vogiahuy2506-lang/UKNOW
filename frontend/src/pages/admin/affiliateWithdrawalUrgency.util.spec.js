import { describe, it, expect } from 'vitest';
import { countBusinessDaysElapsed, getWithdrawalUrgency } from './affiliateWithdrawalUrgency.util.js';

// Mốc cố định: Thứ Hai 2026-09-07 (giờ VN). Xác nhận thứ trong tuần bằng Python trước khi
// viết test (không suy đoán từ lịch): 2026-09-07 = Thứ Hai, 2026-09-16 = Thứ Tư tuần sau.
const MONDAY = '2026-09-07T09:00:00+07:00';

describe('countBusinessDaysElapsed', () => {
  it('cùng ngày tạo → 0 ngày làm việc', () => {
    expect(countBusinessDaysElapsed(MONDAY, new Date('2026-09-07T18:00:00+07:00'))).toBe(0);
  });

  it('null/undefined/ngày không hợp lệ → 0, không throw', () => {
    expect(countBusinessDaysElapsed(null)).toBe(0);
    expect(countBusinessDaysElapsed(undefined)).toBe(0);
    expect(countBusinessDaysElapsed('không phải ngày')).toBe(0);
  });

  it('Thứ Hai → Thứ Tư tuần sau (băng qua 1 cuối tuần) = 7 ngày làm việc', () => {
    const days = countBusinessDaysElapsed(MONDAY, new Date('2026-09-16T09:00:00+07:00'));
    expect(days).toBe(7);
  });

  it('Thứ Hai → Thứ Hai tuần sau nữa (băng qua 2 cuối tuần) = 10 ngày làm việc', () => {
    const days = countBusinessDaysElapsed(MONDAY, new Date('2026-09-21T09:00:00+07:00'));
    expect(days).toBe(10);
  });

  it('không trừ ngày lễ — Quốc khánh 2026-09-02 (nếu nằm trong khoảng) vẫn bị đếm là ngày làm việc', () => {
    // 2026-08-31 (Thứ Hai) -> 2026-09-03 (Thứ Năm): 3 ngày làm việc kể cả 02/09 (lễ, thứ Tư).
    // Đây là hành vi CỐ Ý (không có nguồn dữ liệu lễ) — số đếm ra nhỏ hơn thực tế, nghiêm hơn.
    const days = countBusinessDaysElapsed('2026-08-31T09:00:00+07:00', new Date('2026-09-03T09:00:00+07:00'));
    expect(days).toBe(3);
  });
});

describe('getWithdrawalUrgency', () => {
  it('status khác "pending" → null dù yêu cầu rất cũ (đã paid/rejected không tô màu)', () => {
    const old = { status: 'paid', requested_at: '2026-01-01T00:00:00+07:00' };
    expect(getWithdrawalUrgency(old, new Date('2026-09-21T09:00:00+07:00'))).toBeNull();
  });

  it('5 ngày làm việc (dưới ngưỡng) → null, chưa cảnh báo', () => {
    const w = { status: 'pending', requested_at: MONDAY };
    // 2026-09-14 = 5 ngày làm việc kể từ Thứ Hai 07/09.
    expect(getWithdrawalUrgency(w, new Date('2026-09-14T09:00:00+07:00'))).toBeNull();
  });

  it('6 ngày làm việc → vàng "Còn 1 ngày"', () => {
    const w = { status: 'pending', requested_at: MONDAY };
    const urgency = getWithdrawalUrgency(w, new Date('2026-09-15T09:00:00+07:00'));
    expect(urgency).toEqual({ level: 'warning', businessDays: 6, text: 'Còn 1 ngày' });
  });

  it('Thứ Hai tạo, xem Thứ Tư tuần sau (7 ngày LV, đúng ca nghiệm thu) → PHẢI đổi màu (vàng)', () => {
    const w = { status: 'pending', requested_at: MONDAY };
    const urgency = getWithdrawalUrgency(w, new Date('2026-09-16T09:00:00+07:00'));
    expect(urgency).not.toBeNull();
    expect(urgency.level).toBe('warning');
    expect(urgency.text).toBe('Còn 1 ngày');
  });

  it('8 ngày làm việc → đỏ "Quá hạn 1 ngày"', () => {
    const w = { status: 'pending', requested_at: MONDAY };
    const urgency = getWithdrawalUrgency(w, new Date('2026-09-17T09:00:00+07:00'));
    expect(urgency).toEqual({ level: 'overdue', businessDays: 8, text: 'Quá hạn 1 ngày' });
  });

  it('10 ngày làm việc (đúng ca nghiệm thu) → đỏ "Quá hạn 3 ngày"', () => {
    const w = { status: 'pending', requested_at: MONDAY };
    const urgency = getWithdrawalUrgency(w, new Date('2026-09-21T09:00:00+07:00'));
    expect(urgency).toEqual({ level: 'overdue', businessDays: 10, text: 'Quá hạn 3 ngày' });
  });
});
