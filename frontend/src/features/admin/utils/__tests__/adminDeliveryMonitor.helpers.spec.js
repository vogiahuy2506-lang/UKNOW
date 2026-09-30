import { describe, it, expect } from 'vitest';
import {
  DELIVERY_WINDOWS,
  buildDailySlots,
  countHoursToday,
  eachIsoDay,
  formatIsoDayMonth,
  pickTopWaitReason,
} from '../adminDeliveryMonitor.helpers';

// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — hàm thuần của trang Giám sát gửi tin phía admin.

describe('DELIVERY_WINDOWS', () => {
  it('đúng ba khoá cửa sổ khớp BE, theo thứ tự hiển thị', () => {
    expect(DELIVERY_WINDOWS).toEqual(['today', '7d', '30d']);
  });
});

describe('formatIsoDayMonth', () => {
  it('YYYY-MM-DD → dd/MM; giá trị sai → fallback', () => {
    expect(formatIsoDayMonth('2026-09-30')).toBe('30/09');
    expect(formatIsoDayMonth('2027-01-02')).toBe('02/01');
    expect(formatIsoDayMonth('30/09/2026')).toBe('-');
    expect(formatIsoDayMonth(null, '?')).toBe('?');
    expect(formatIsoDayMonth('')).toBe('-');
  });
});

describe('eachIsoDay', () => {
  it('gồm cả hai đầu, qua ranh giới tháng / năm / năm nhuận, không phụ thuộc múi giờ máy', () => {
    expect(eachIsoDay('2026-09-24', '2026-09-30')).toHaveLength(7);
    expect(eachIsoDay('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(eachIsoDay('2028-02-28', '2028-03-01')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
    expect(eachIsoDay('2026-09-01', '2026-09-30')).toHaveLength(30);
    expect(eachIsoDay('2026-09-30', '2026-09-30')).toEqual(['2026-09-30']);
  });

  it('đầu vào sai hoặc ngược → mảng rỗng', () => {
    expect(eachIsoDay('2026-09-30', '2026-09-24')).toEqual([]);
    expect(eachIsoDay(null, '2026-09-24')).toEqual([]);
    expect(eachIsoDay('abc', 'def')).toEqual([]);
  });
});

describe('buildDailySlots', () => {
  it('bù ngày trống, cộng theo kênh, chỉ năm kênh "tin", total từng cột', () => {
    const slots = buildDailySlots(
      [
        { day: '2026-09-26', channel: 'email', sent: 4 },
        { day: '2026-09-26', channel: 'email', sent: 1 },
        { day: '2026-09-26', channel: 'telegram', sent: 2 },
        { day: '2026-09-26', channel: 'zalo_friend_request', sent: 99 }, // không phải "tin"
        { day: '2026-09-30', channel: 'zalo_personal', sent: 3 },
        { day: '2026-08-01', channel: 'email', sent: 50 }, // ngoài khoảng → bị bỏ
      ],
      '2026-09-24',
      '2026-09-30'
    );
    expect(slots.map((slot) => slot.label)).toEqual(['24/09', '25/09', '26/09', '27/09', '28/09', '29/09', '30/09']);
    expect(slots[2]).toEqual({
      day: '2026-09-26', label: '26/09', email: 5, zalo_personal: 0, zalo_group: 0, telegram: 2, whatsapp: 0, total: 7,
    });
    expect(slots[0].total).toBe(0);
    expect(slots[6]).toMatchObject({ zalo_personal: 3, total: 3 });
    expect(slots.reduce((sum, slot) => sum + slot.total, 0)).toBe(10);
  });

  it('không có dòng nào / thiếu khoảng → không vỡ', () => {
    expect(buildDailySlots(undefined, '2026-09-29', '2026-09-30').map((slot) => slot.total)).toEqual([0, 0]);
    expect(buildDailySlots([], undefined, undefined)).toEqual([]);
  });
});

describe('countHoursToday', () => {
  it('số cột giờ từ 00:00 tới giờ hiện tại theo GIỜ VN: 03:30 VN → 4; 00:10 VN → 1; 23:59 VN → 24', () => {
    expect(countHoursToday('2026-09-29T20:30:00.000Z')).toBe(4);
    expect(countHoursToday('2026-09-29T17:10:00.000Z')).toBe(1);
    expect(countHoursToday('2026-09-30T16:59:00.000Z')).toBe(24);
  });

  it('thời điểm sai → 24 (không vỡ)', () => {
    expect(countHoursToday('không phải ngày')).toBe(24);
    expect(countHoursToday(undefined)).toBe(24);
  });
});

describe('pickTopWaitReason', () => {
  it('gom theo NHÃN dịch: hai mã hạn mức khác nhau cùng một nhãn "đã hết lượt gửi" cộng dồn và thắng mã lẻ đứng đầu', () => {
    expect(pickTopWaitReason([
      { reason: 'quiet_hours', count: 2 },
      { reason: 'plan_quota_daily', count: 2 },
      { reason: 'plan_quota_account_daily_email', count: 1 },
    ])).toEqual({ i18nKey: 'userDeliveryMonitor.waitReason.planQuota', count: 3 });
  });

  it('hoà → nhãn xuất hiện trước; mã lạ và null gom vào "hệ thống đang bận"', () => {
    expect(pickTopWaitReason([
      { reason: 'quiet_hours', count: 2 },
      { reason: 'plan_quota_daily', count: 2 },
    ])).toEqual({ i18nKey: 'quickSend.deferredReasonQuietHours', count: 2 });
    expect(pickTopWaitReason([
      { reason: null, count: 1 },
      { reason: 'ma_la', count: 2 },
    ])).toEqual({ i18nKey: 'quickSend.deferredReasonUnknown', count: 3 });
  });

  it('không có lượt chờ → null', () => {
    expect(pickTopWaitReason([])).toBeNull();
    expect(pickTopWaitReason(undefined)).toBeNull();
  });
});
