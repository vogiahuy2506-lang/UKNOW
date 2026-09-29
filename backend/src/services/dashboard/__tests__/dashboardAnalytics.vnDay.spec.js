import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Không chạm CSDL: chỉ kiểm parseDateRange/createTimelineMap — hàm thuần trên service.
const { default: dashboardAnalyticsService } = await import('../dashboardAnalytics.service.js');

/**
 * Sửa 30/09/2026: ngày trên biểu đồ = ngày VIỆT NAM. CSDL gộp `DATE(sent_at)` theo múi phiên Asia/Ho_Chi_Minh
 * (dashboard.repository), còn `parseDateRange` từng lấy ngày UTC → từ 00:00 đến 07:00 giờ VN, khoá "hôm nay" của
 * CSDL chưa có trong timelineMap → tin gửi hôm nay rơi mất. CI 30/09 00:13 VN đỏ `channelAdapterReportsW7b`.
 */
describe('dashboardAnalytics.parseDateRange — ngày theo giờ Việt Nam', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('00:30 giờ VN ngày 30/09 (17:30Z ngày 29/09): endDate là 30/09, không phải 29/09', () => {
    jest.setSystemTime(new Date('2026-09-29T17:30:00.000Z'));
    const range = dashboardAnalyticsService.parseDateRange({ period: '7d' });
    expect(range.endDate).toBe('2026-09-30');
    expect(range.startDate).toBe('2026-09-24');
    // Mốc SQL = 00:00 giờ VN (= 17:00Z hôm trước), không phải 00:00 UTC.
    expect(range.startAt).toBe('2026-09-23T17:00:00.000Z');
    expect(range.endExclusive).toBe('2026-09-30T17:00:00.000Z');
  });

  it('12:00 giờ VN: endDate vẫn là hôm nay VN', () => {
    jest.setSystemTime(new Date('2026-09-30T05:00:00.000Z'));
    const range = dashboardAnalyticsService.parseDateRange({ period: '30d' });
    expect(range.endDate).toBe('2026-09-30');
    expect(range.startDate).toBe('2026-09-01');
  });

  it('timelineMap có khoá "hôm nay VN" khi đang là rạng sáng VN', () => {
    jest.setSystemTime(new Date('2026-09-29T18:00:00.000Z')); // 01:00 VN 30/09
    const range = dashboardAnalyticsService.parseDateRange({ period: '7d' });
    const map = dashboardAnalyticsService.createTimelineMap(range.startDate, range.endDate);
    expect(map.has('2026-09-30')).toBe(true);
    expect(map.size).toBe(7);
  });

  it('ngày tường minh giữ nguyên, mốc SQL dịch về 00:00 VN', () => {
    jest.setSystemTime(new Date('2026-09-29T17:30:00.000Z'));
    const range = dashboardAnalyticsService.parseDateRange({ startDate: '2026-09-10', endDate: '2026-09-12' });
    expect(range).toMatchObject({ startDate: '2026-09-10', endDate: '2026-09-12' });
    expect(range.startAt).toBe('2026-09-09T17:00:00.000Z');
    expect(range.endExclusive).toBe('2026-09-12T17:00:00.000Z');
  });
});
