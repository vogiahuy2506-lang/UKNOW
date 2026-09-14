import { describe, it, expect } from '@jest/globals';
import {
  weekdayOf,
  todayVn,
  toAppointmentAt,
  validateSlot,
  listSlotCandidates,
  addDaysToDateStr,
} from '../formBooking.util.js';

const FULL_WEEK_CONFIG = {
  enabled: true,
  weeklySlots: {
    0: ['09:00'],
    1: ['09:00', '10:00'],
    2: ['09:00', '10:00'],
    3: ['09:00'],
    4: ['09:00'],
    5: ['09:00'],
    6: [],
  },
  slotCapacity: null,
  daysAhead: 30,
  minNoticeMinutes: 60,
  closedDates: [],
};

describe('formBooking.util — weekdayOf', () => {
  it('2026-09-20 là Chủ nhật (0)', () => {
    expect(weekdayOf('2026-09-20')).toBe(0);
  });

  it('2026-09-22 là Thứ ba (2)', () => {
    expect(weekdayOf('2026-09-22')).toBe(2);
  });
});

describe('formBooking.util — toAppointmentAt', () => {
  it('2026-09-20 09:00 (giờ VN) → 2026-09-20T02:00:00.000Z', () => {
    expect(toAppointmentAt('2026-09-20', '09:00').toISOString()).toBe('2026-09-20T02:00:00.000Z');
  });

  it('2026-09-20 00:30 (giờ VN) → lùi sang ngày trước theo UTC: 2026-09-19T17:30:00.000Z', () => {
    expect(toAppointmentAt('2026-09-20', '00:30').toISOString()).toBe('2026-09-19T17:30:00.000Z');
  });
});

describe('formBooking.util — todayVn', () => {
  it('18:30 UTC (01:30 sáng hôm sau giờ VN) → ngày hôm sau theo lịch VN', () => {
    expect(todayVn(new Date('2026-09-19T18:30:00Z'))).toBe('2026-09-20');
  });

  it('16:30 UTC (23:30 giờ VN) → vẫn cùng ngày UTC', () => {
    expect(todayVn(new Date('2026-09-19T16:30:00Z'))).toBe('2026-09-19');
  });
});

describe('formBooking.util — addDaysToDateStr', () => {
  it('cộng ngày qua ranh giới tháng', () => {
    expect(addDaysToDateStr('2026-09-29', 3)).toBe('2026-10-02');
  });
});

describe('formBooking.util — validateSlot', () => {
  // now cố định: 2026-09-14 10:00 giờ VN (2026-09-14T03:00:00Z) — Thứ hai (weekday 1)
  const NOW = new Date('2026-09-14T03:00:00Z');

  it('khung không có trong weeklySlots của thứ đó → lỗi 400', () => {
    // 2026-09-15 là Thứ ba (2), config thứ ba chỉ có 09:00/10:00 — 10:15 không có trong lịch
    expect(() => validateSlot(FULL_WEEK_CONFIG, '2026-09-15', '10:15', NOW)).toThrow();
    try {
      validateSlot(FULL_WEEK_CONFIG, '2026-09-15', '10:15', NOW);
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });

  it('ngày nằm trong closedDates → lỗi 400', () => {
    const config = { ...FULL_WEEK_CONFIG, closedDates: ['2026-09-15'] };
    expect(() => validateSlot(config, '2026-09-15', '09:00', NOW)).toThrow(/đóng/);
  });

  it('khung đã qua (trước NOW) → lỗi 400', () => {
    // NOW = 2026-09-14 10:00 VN; đặt cùng ngày 09:00 (đã qua)
    expect(() => validateSlot(FULL_WEEK_CONFIG, '2026-09-14', '09:00', NOW)).toThrow(/qua/);
  });

  it('trong khoảng minNoticeMinutes (đặt quá sát giờ) → lỗi 400', () => {
    // NOW = 10:00 VN, minNotice = 60 phút → khung 10:30 (cùng ngày) chỉ còn 30 phút, không đủ
    const config = { ...FULL_WEEK_CONFIG, weeklySlots: { ...FULL_WEEK_CONFIG.weeklySlots, 1: ['10:30'] } };
    expect(() => validateSlot(config, '2026-09-14', '10:30', NOW)).toThrow(/phút/);
  });

  it('vượt quá daysAhead tính từ todayVn(now) → lỗi 400', () => {
    const config = { ...FULL_WEEK_CONFIG, daysAhead: 5 };
    // todayVn(NOW) = 2026-09-14, +5 ngày = 2026-09-19 là hạn cuối; 2026-09-21 (thứ hai tuần sau) vượt quá
    expect(() => validateSlot(config, '2026-09-21', '09:00', NOW)).toThrow(/thời hạn/);
  });

  it('khung hợp lệ → trả về appointmentAt đúng', () => {
    const result = validateSlot(FULL_WEEK_CONFIG, '2026-09-15', '09:00', NOW);
    expect(result.appointmentAt.toISOString()).toBe('2026-09-15T02:00:00.000Z');
  });
});

describe('formBooking.util — listSlotCandidates', () => {
  const NOW = new Date('2026-09-14T03:00:00Z'); // Thứ hai, 10:00 VN

  it('trả về danh sách khung hợp lệ trong N ngày, bỏ khung đã qua/ngày nghỉ', () => {
    const candidates = listSlotCandidates(FULL_WEEK_CONFIG, '2026-09-14', 3, NOW);
    // 2026-09-14 (T2, đã qua 09:00) → chỉ còn không có khung nào hợp lệ hôm nay (09:00 đã qua)
    // 2026-09-15 (T3): 09:00, 10:00
    // 2026-09-16 (T4): 09:00
    expect(candidates).toEqual([
      { date: '2026-09-15', time: '09:00' },
      { date: '2026-09-15', time: '10:00' },
      { date: '2026-09-16', time: '09:00' },
    ]);
  });

  it('config không bật đặt lịch → mảng rỗng', () => {
    expect(listSlotCandidates({ enabled: false }, '2026-09-14', 7, NOW)).toEqual([]);
    expect(listSlotCandidates(null, '2026-09-14', 7, NOW)).toEqual([]);
  });
});
