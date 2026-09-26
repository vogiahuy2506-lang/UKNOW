import { describe, expect, it, jest } from '@jest/globals';

const mockMetricPaidAfterCancelledOrders = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricPaidAfterCancelledOrders: mockMetricPaidAfterCancelledOrders,
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

// PR-4 (đợt rà soát 26/09, PLAN_VA_LOI_LUONG_TIEN_2026-09-26)
describe('alertEvaluator — quy tắc order_paid_after_cancelled', () => {
  const rule = {
    code: 'order_paid_after_cancelled',
    thresholdValue: 1,
    config: { maxAgeHours: 168 },
  };

  it('im lặng khi không có đơn nào bị flag', async () => {
    mockMetricPaidAfterCancelledOrders.mockResolvedValueOnce([]);
    expect(await evaluateRuleForTests(rule)).toBeNull();
  });

  it('bắn khi có đơn cancelled/failed nhưng PayOS báo đã trả, kèm mã đơn để tra', async () => {
    mockMetricPaidAfterCancelledOrders.mockResolvedValueOnce([
      { orderCode: '179041087308806', amount: 199000, status: 'cancelled', updatedAt: '2026-09-26T00:00:00.000Z' },
    ]);

    const res = await evaluateRuleForTests(rule);
    expect(res).not.toBeNull();
    expect(res.measuredValue).toBe(1);
    expect(res.message).toContain('1 đơn cancelled/failed nhưng PayOS báo đã trả tiền');
    expect(res.message).toContain('#179041087308806');
    expect(res.message).toContain('kích hoạt bù hoặc hoàn tiền');
  });

  it('dùng maxAgeHours mặc định 168 giờ khi config bỏ trống', async () => {
    mockMetricPaidAfterCancelledOrders.mockResolvedValueOnce([]);
    await evaluateRuleForTests({ code: 'order_paid_after_cancelled', thresholdValue: 1, config: {} });
    expect(mockMetricPaidAfterCancelledOrders).toHaveBeenLastCalledWith(168);
  });

  it('tôn trọng maxAgeHours tuỳ chỉnh', async () => {
    mockMetricPaidAfterCancelledOrders.mockResolvedValueOnce([]);
    await evaluateRuleForTests({ code: 'order_paid_after_cancelled', thresholdValue: 1, config: { maxAgeHours: 24 } });
    expect(mockMetricPaidAfterCancelledOrders).toHaveBeenLastCalledWith(24);
  });
});
