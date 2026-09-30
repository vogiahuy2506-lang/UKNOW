import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// PR-9 (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30) — phần thuần của service Tổng quan / Phễu. Phép đếm thật chạy SQL ở
// tests/integration (adminStats.test.js, adminFunnel.test.js); ở đây chỉ ghim cách ghép số: % so với bước trước,
// "mất ở bước này", % so kỳ trước (kỳ trước = 0 → không có phần trăm), tổng "Cần xử lý".
const mockGetFunnelCohorts = jest.fn();
const mockGetTimeToFirstSend = jest.fn();
const mockGetKpiStats = jest.fn();
const mockGetMonthlyRevenue = jest.fn();
const mockGetRecentOrders = jest.fn();
const mockGetRecentMembers = jest.fn();
const mockMetricStuckEinvoices = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/adminFunnel.repository.js', () => ({
  getFunnelCohorts: mockGetFunnelCohorts,
  getTimeToFirstSend: mockGetTimeToFirstSend,
}));
jest.unstable_mockModule('../../../repositories/admin/adminStats.repository.js', () => ({
  getKpiStats: mockGetKpiStats,
  getMonthlyRevenue: mockGetMonthlyRevenue,
  getRecentOrders: mockGetRecentOrders,
  getRecentMembers: mockGetRecentMembers,
}));
jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricStuckEinvoices: mockMetricStuckEinvoices,
}));

const { buildFunnelSteps, getFunnelOverview, FUNNEL_STEP_KEYS } = await import('../adminFunnel.service.js');
const { pctChange, getDashboardOverview } = await import('../adminStats.service.js');

describe('buildFunnelSteps', () => {
  it('bước đầu không có bước trước; các bước sau có % so với bước trước và số mất', () => {
    const steps = buildFunnelSteps({ registered: 120, channelConnected: 60, firstSend: 45, paid: 9 });
    expect(steps).toEqual([
      { key: 'registered', count: 120, pctOfPrevious: null, lost: null },
      { key: 'channelConnected', count: 60, pctOfPrevious: 50, lost: 60 },
      { key: 'firstSend', count: 45, pctOfPrevious: 75, lost: 15 },
      { key: 'paid', count: 9, pctOfPrevious: 20, lost: 36 },
    ]);
    expect(steps.map((s) => s.key)).toEqual([...FUNNEL_STEP_KEYS]);
  });

  it('làm tròn một chữ số thập phân; bước trước = 0 thì không có phần trăm (null), không phải 0% hay 100%', () => {
    const steps = buildFunnelSteps({ registered: 3, channelConnected: 2, firstSend: 0, paid: 0 });
    expect(steps[1].pctOfPrevious).toBe(66.7);
    expect(steps[2]).toMatchObject({ pctOfPrevious: 0, lost: 2 });
    expect(steps[3]).toMatchObject({ pctOfPrevious: null, lost: 0 });
  });
});

describe('getFunnelOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFunnelCohorts.mockResolvedValue({
      since: '2025-10-01',
      cohorts: [
        { cohortKey: '2026-08', cohort: '08/2026', registered: 50, channelConnected: 30, firstSend: 25, paid: 5, paidWithoutSend: 1 },
        { cohortKey: '2026-09', cohort: '09/2026', registered: 70, channelConnected: 30, firstSend: 20, paid: 4, paidWithoutSend: 2 },
      ],
    });
    mockGetTimeToFirstSend.mockResolvedValue({ totalCustomers: 120, sentCount: 45 });
  });

  it('tổng bước = cộng các cohort; giữ paidWithoutSend và timeToFirstSend', async () => {
    const data = await getFunnelOverview();
    expect(data.steps.map((s) => s.count)).toEqual([120, 60, 45, 9]);
    expect(data.paidWithoutSend).toBe(3);
    expect(data.since).toBe('2025-10-01');
    expect(data.cohorts).toHaveLength(2);
    expect(data.timeToFirstSend).toEqual({ totalCustomers: 120, sentCount: 45 });
    expect(mockGetFunnelCohorts).toHaveBeenCalledWith({ since: null });
  });

  it('truyền since hợp lệ xuống repository; since sai (định dạng, ngày không tồn tại, không phải chuỗi) → 400', async () => {
    await getFunnelOverview({ since: '2026-01-01' });
    expect(mockGetFunnelCohorts).toHaveBeenCalledWith({ since: '2026-01-01' });
    for (const bad of ['abc', '2026-02-30', '2026-13-01', ['2026-01-01'], { a: 1 }]) {
      await expect(getFunnelOverview({ since: bad })).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe('Tổng quan admin — pctChange và "Cần xử lý"', () => {
  it('pctChange: kỳ trước = 0 → null (bản cũ trả +100%); còn lại làm tròn 1 chữ số', () => {
    expect(pctChange(500, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
    expect(pctChange(150, 100)).toBe(50);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(1, 3)).toBe(-66.7);
  });

  it('attention.total = tiền vào chưa ghi doanh thu + hoá đơn kẹt + rút tiền quá hạn; số % lấy từ cùng kỳ', async () => {
    mockGetKpiStats.mockResolvedValue({
      monthKey: '2026-09', monthLabel: '09/2026', todayLabel: '30/09',
      revenueThisMonth: 200, revenueBySource: { plan: 200, topup: 0, manual: 0 }, refundedThisMonth: 0, revenuePrevSamePeriod: 100,
      paidOrdersThisMonth: 2, totalCustomers: 8, payingCustomers: 4, trialCustomers: 3,
      newCustomersThisMonth: 5, newCustomersPrevSamePeriod: 0, expiringPaid7d: 1,
      paidAfterCancelledCount: 2, paidAfterCancelledAmount: 500, overdueWithdrawals: 1,
    });
    mockGetMonthlyRevenue.mockResolvedValue([]);
    mockGetRecentOrders.mockResolvedValue([]);
    mockGetRecentMembers.mockResolvedValue([]);
    mockMetricStuckEinvoices.mockResolvedValue({ total: 3 });

    const { kpi } = await getDashboardOverview();
    expect(kpi.attention).toEqual({
      paidAfterCancelled: { count: 2, amount: 500 },
      stuckEinvoices: 3,
      overdueWithdrawals: 1,
      total: 6,
    });
    expect(kpi.revenueMomPct).toBe(100);
    expect(kpi.newCustomersMomPct).toBeNull();
    expect(mockMetricStuckEinvoices).toHaveBeenCalledWith(6);
  });
});
