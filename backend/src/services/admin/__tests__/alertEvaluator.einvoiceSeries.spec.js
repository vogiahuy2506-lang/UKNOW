import { describe, expect, it, jest } from '@jest/globals';

const mockMetricLatestEinvoiceSeries = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricLatestEinvoiceSeries: mockMetricLatestEinvoiceSeries,
  metricCampaignFailRate: jest.fn(),
  metricZaloInboundCount: jest.fn(),
  metricConsecutiveCronNoops: jest.fn(),
  metricLatestCronRescued: jest.fn(),
  metricAiTokenSpike: jest.fn(),
  metricZaloDisconnectedLong: jest.fn(),
  metricZaloQrScanPendingStale: jest.fn(),
  metricDailyActiveUsers: jest.fn(),
  metricMonthlyActiveUsers: jest.fn(),
  metricRetentionD1: jest.fn(),
  metricRetentionD7: jest.fn(),
  metricRetentionD30: jest.fn(),
  metricStickinessRatio: jest.fn(),
  metricAvgUserRating: jest.fn(),
  metricNpsScore: jest.fn(),
  metricCsatScore: jest.fn(),
  metricTotalRevenue: jest.fn(),
  metricMrr: jest.fn(),
  metricArr: jest.fn(),
  metricArpu: jest.fn(),
  metricLtv: jest.fn(),
  metricCustomerChurnRate: jest.fn(),
  metricRevenueChurnRate: jest.fn(),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');

describe('alertEvaluator — einvoice_series_low rule', () => {
  const rule = {
    code: 'einvoice_series_low',
    thresholdValue: 50,
    config: { jobCode: 'einvoice_series_check' },
  };

  it('ignores when feature is disabled (m.result.disabled = true)', async () => {
    mockMetricLatestEinvoiceSeries.mockResolvedValueOnce({
      found: true,
      cLai: null,
      error: null,
      yearMismatch: false,
      notFound: false,
      result: { scanned: 0, cLai: null, disabled: true },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).toBeNull();
  });

  it('fires when error or failure occurred', async () => {
    mockMetricLatestEinvoiceSeries.mockResolvedValueOnce({
      found: true,
      cLai: null,
      error: 'Connection refused to Mat Bao',
      yearMismatch: false,
      notFound: false,
      result: { status: 'error', error: 'Connection refused to Mat Bao' },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.message).toContain('Không kết nối được API Mắt Bão');
    expect(res.message).toContain('Connection refused to Mat Bao');
  });

  it('fires when not found in templates', async () => {
    mockMetricLatestEinvoiceSeries.mockResolvedValueOnce({
      found: true,
      cLai: 0,
      error: null,
      yearMismatch: false,
      notFound: true,
      result: { notFound: true, khhdon: 'C26TAT' },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.message).toContain('Không tìm thấy dải ký hiệu hoá đơn Mắt Bão');
  });

  it('fires when series year does not match current year', async () => {
    mockMetricLatestEinvoiceSeries.mockResolvedValueOnce({
      found: true,
      cLai: 100,
      error: null,
      yearMismatch: true,
      notFound: false,
      result: { yearMismatch: true, khhdon: 'C26TAT' },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.message).toContain('không khớp năm hiện tại');
  });

  it('fires when remaining count is low (<= 50)', async () => {
    mockMetricLatestEinvoiceSeries.mockResolvedValueOnce({
      found: true,
      cLai: 25,
      error: null,
      yearMismatch: false,
      notFound: false,
      result: { cLai: 25 },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.measuredValue).toBe(25);
    expect(res.message).toContain('sắp hết: còn lại 25 số');
  });

  it('returns null when remaining count is healthy (> 50) and year matches', async () => {
    mockMetricLatestEinvoiceSeries.mockResolvedValueOnce({
      found: true,
      cLai: 200,
      error: null,
      yearMismatch: false,
      notFound: false,
      result: { cLai: 200 },
    });

    const res = await evaluateRuleForTests(rule);
    expect(res).toBeNull();
  });
});
