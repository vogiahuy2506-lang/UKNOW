/**
 * PR-7 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — định dạng số của khối "Hoạt động nhóm" và thẻ "Tiến độ của bạn".
 * Dùng từ điển vi THẬT: kiểm đúng câu chữ khách thấy ("35 / 100", "1.234 · 12 chưa gửi được", "2 · 1 đang chờ").
 */
import { describe, it, expect } from 'vitest';
import { makeT } from '../../../../test/realI18n.js';
import {
  formatAiCredits,
  formatCount,
  formatDateTimeVn,
  formatDayMonthVn,
  formatPeriodNote,
  formatRunningCampaigns,
  formatSentThisMonth,
} from '../teamOverview.util';

const t = makeT();

describe('formatCount', () => {
  it('dấu chấm ngăn hàng nghìn kiểu Việt Nam; giá trị rỗng / lạ → 0', () => {
    expect(formatCount(1234)).toBe('1.234');
    expect(formatCount(1234567)).toBe('1.234.567');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(undefined)).toBe('0');
    expect(formatCount('abc')).toBe('0');
  });
});

describe('formatAiCredits', () => {
  it('có hạn mức → "35 / 100"; không đặt hạn mức → "35"', () => {
    expect(formatAiCredits({ aiCreditsUsed: 35, aiCreditsLimit: 100 })).toBe('35 / 100');
    expect(formatAiCredits({ aiCreditsUsed: 35, aiCreditsLimit: null })).toBe('35');
    expect(formatAiCredits({ aiCreditsUsed: 1200, aiCreditsLimit: 5000 })).toBe('1.200 / 5.000');
  });

  it('hạn mức 0 là hạn mức thật (chặn hết) chứ không phải "không đặt"; chưa có kỳ (null) → "—"', () => {
    expect(formatAiCredits({ aiCreditsUsed: 0, aiCreditsLimit: 0 })).toBe('0 / 0');
    expect(formatAiCredits({ aiCreditsUsed: null, aiCreditsLimit: 100 })).toBe('—');
    expect(formatAiCredits({})).toBe('—');
  });
});

describe('formatSentThisMonth', () => {
  it('"1.234 · 12 chưa gửi được" khi có đích chưa gửi được; không có thì chỉ số đã gửi', () => {
    expect(formatSentThisMonth({ sentThisMonth: 1234, failedThisMonth: 12 }, t)).toBe('1.234 · 12 chưa gửi được');
    expect(formatSentThisMonth({ sentThisMonth: 5, failedThisMonth: 0 }, t)).toBe('5');
    expect(formatSentThisMonth({}, t)).toBe('0');
  });
});

describe('formatRunningCampaigns', () => {
  it('"2 · 1 đang chờ" khi có chiến dịch đang chờ; không có thì chỉ số đang chạy', () => {
    expect(formatRunningCampaigns({ runningCampaigns: 2, waitingCampaigns: 1 }, t)).toBe('2 · 1 đang chờ');
    expect(formatRunningCampaigns({ runningCampaigns: 3, waitingCampaigns: 0 }, t)).toBe('3');
    expect(formatRunningCampaigns({ runningCampaigns: 0 }, t)).toBe('0');
  });
});

describe('formatDateTimeVn / formatDayMonthVn — theo giờ VN, không phụ thuộc múi giờ máy', () => {
  it('"dd/MM/yyyy HH:mm"; 18:00 VN (11:00 UTC) vẫn là ngày hôm đó', () => {
    expect(formatDateTimeVn('2026-09-15T11:00:00.000Z')).toBe('15/09/2026 18:00');
  });

  it('sau 17:00 UTC là ngày hôm sau ở VN — đúng phía', () => {
    expect(formatDateTimeVn('2026-09-15T17:30:00.000Z')).toBe('16/09/2026 00:30');
  });

  it('thiếu / không hợp lệ → null', () => {
    expect(formatDateTimeVn(null)).toBeNull();
    expect(formatDateTimeVn('khong-phai-ngay')).toBeNull();
    expect(formatDayMonthVn(undefined)).toBeNull();
  });

  it('"dd/MM" của ngày làm mới kỳ', () => {
    expect(formatDayMonthVn('2026-10-10T03:00:00.000Z')).toBe('10/10');
    expect(formatDayMonthVn('2026-10-09T18:00:00.000Z')).toBe('10/10'); // 01:00 ngày 10 giờ VN
  });
});

describe('formatPeriodNote', () => {
  it('có kỳ → nói rõ lượt AI tính theo kỳ gói và ngày làm mới', () => {
    expect(formatPeriodNote({ end: '2026-10-10T03:00:00.000Z' }, t)).toBe('Tháng này · lượt AI tính theo kỳ gói (làm mới ngày 10/10)');
  });

  it('không có kỳ → chỉ "Tháng này"', () => {
    expect(formatPeriodNote(null, t)).toBe('Tháng này');
  });
});
