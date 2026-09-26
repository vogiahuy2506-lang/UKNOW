import { describe, expect, it, jest } from '@jest/globals';

const mockMetricLatestAffiliateClosingErrors = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricLatestAffiliateClosingErrors: mockMetricLatestAffiliateClosingErrors,
  metricPaidAfterCancelledOrders: jest.fn(),
  metricStuckEinvoices: jest.fn(),
  metricLatestEinvoiceSeries: jest.fn(),
  metricCampaignFailRate: jest.fn(),
  metricCampaignRunFailures: jest.fn(),
  metricCampaignRepeatedFailures: jest.fn(),
  metricStalledRuns: jest.fn(),
  metricZaloInboundCount: jest.fn(),
  metricConsecutiveCronNoops: jest.fn(),
  metricLatestCronRescued: jest.fn(),
  metricAiTokenSpike: jest.fn(),
  metricZaloDisconnected: jest.fn(),
  metricStalePendingOrders: jest.fn(),
  metricLoginFailFlood: jest.fn(),
  listRules: jest.fn(),
  listEvents: jest.fn(),
  lastEventForRule: jest.fn(),
  insertEvent: jest.fn(),
  updateRule: jest.fn(),
  resolveEvent: jest.fn(),
  listAdminAlertEmails: jest.fn(),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');

// "Nợ nhỏ" PR-4 (26/09, PLAN_VA_LOI_LUONG_TIEN_2026-09-26) — item 4
describe('alertEvaluator — quy tắc affiliate_closing_errored_referrers', () => {
  const rule = {
    code: 'affiliate_closing_errored_referrers',
    thresholdValue: 1,
    config: { jobCode: 'affiliate_month_closing' },
  };

  it('im lặng khi chưa có lượt chạy nào (found=false)', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({ erroredReferrers: 0, found: false, result: null });
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('im lặng khi lượt gần nhất không có referrer lỗi', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({ erroredReferrers: 0, found: true, result: {} });
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('bắn khi lượt gần nhất có referrer lỗi, dù cron báo success/noop', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({
      erroredReferrers: 2,
      found: true,
      result: { status: 'success', erroredReferrers: 2, monthKey: '2026-08' },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.measuredValue).toBe(2);
    expect(res.message).toContain('2 referrer lỗi');
    expect(res.message).toContain('AffiliateClosing');
  });

  it('dùng jobCode mặc định khi config bỏ trống', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({ erroredReferrers: 0, found: false, result: null });
    await evaluateRuleForTests({ code: 'affiliate_closing_errored_referrers', thresholdValue: 1, config: {} });
    expect(mockMetricLatestAffiliateClosingErrors).toHaveBeenLastCalledWith(
      'affiliate_month_closing',
      'affiliate_closing_errored_referrers'
    );
  });

  it('tôn trọng threshold tuỳ chỉnh — chỉ bắn khi >= threshold', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({ erroredReferrers: 2, found: true, result: {} });
    const res = await evaluateRuleForTests({ code: 'affiliate_closing_errored_referrers', thresholdValue: 3, config: {} });
    expect(res).toBeNull();
  });

  // Review 26/09 — catch-up nuốt lỗi cả tháng (results[].status='error') mà vẫn báo success/noop,
  // và recordRun ghi status='failure' khi cả job ném lỗi: cả hai trước đây không cảnh báo.
  it('bắn khi một tháng lỗi nguyên tháng dù không có referrer lỗi', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({
      erroredReferrers: 0, erroredMonths: 1, failedRun: false, found: true, result: {},
    });
    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.measuredValue).toBe(1);
    expect(res.message).toContain('1 tháng lỗi');
  });

  it('bắn khi lượt chạy hỏng hẳn (status failure)', async () => {
    mockMetricLatestAffiliateClosingErrors.mockResolvedValueOnce({
      erroredReferrers: 0, erroredMonths: 0, failedRun: true, found: true, result: {},
    });
    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.message).toContain('lượt chạy hỏng hẳn');
  });
});
