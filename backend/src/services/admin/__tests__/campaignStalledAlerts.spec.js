import { describe, expect, it, jest } from '@jest/globals';

const mockMetricStalledRuns = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricStalledRuns: mockMetricStalledRuns,
  metricCampaignRunFailures: jest.fn(),
  metricCampaignRepeatedFailures: jest.fn(),
  metricCampaignFailRate: jest.fn(),
  metricZaloInboundCount: jest.fn(),
  metricConsecutiveCronNoops: jest.fn(),
  metricLatestCronRescued: jest.fn(),
  metricEinvoiceSeriesRuns: jest.fn(),
  metricEinvoiceStuckPending: jest.fn(),
  metricZaloDisconnected: jest.fn(),
  metricStalePendingOrders: jest.fn(),
  metricLoginFailFlood: jest.fn(),
}));

const { evaluateRuleForTests } = await import('../alertEvaluator.service.js');
const alertRepo = await import('../../../repositories/admin/alert.repository.js');

describe('PR-2: Campaign stalled runs alert metric & evaluator', () => {
  describe('metricStalledRuns export', () => {
    it('alert.repository exports metricStalledRuns', () => {
      expect(typeof alertRepo.metricStalledRuns).toBe('function');
    });
  });

  describe('evaluateRuleForTests', () => {
    it('campaign_run_stalled: có run đứng yên >= 6h → sinh cảnh báo', async () => {
      mockMetricStalledRuns.mockResolvedValueOnce([
        {
          runId: 105,
          campaignId: 2,
          campaignName: 'Flash Sale Tháng 8',
          startedAt: new Date(Date.now() - 7 * 3600 * 1000),
          lastExecutionAt: null,
          totalRecipients: 100,
          successfulSends: 10,
          failedSends: 0,
        },
      ]);

      const rule = {
        code: 'campaign_run_stalled',
        thresholdValue: 1,
        windowMinutes: 360,
        config: { hours: 6 },
      };

      const result = await evaluateRuleForTests(rule);
      expect(result).not.toBeNull();
      expect(result.measuredValue).toBe(1);
      expect(result.message).toContain('Có 1 lượt chạy chiến dịch đang running nhưng không có hoạt động trong 6 giờ qua');
      expect(result.payload.stalledRuns).toHaveLength(1);
      expect(result.payload.hours).toBe(6);
    });

    it('campaign_run_stalled: không có run đứng yên → trả null', async () => {
      mockMetricStalledRuns.mockResolvedValueOnce([]);

      const rule = {
        code: 'campaign_run_stalled',
        thresholdValue: 1,
        windowMinutes: 360,
        config: { hours: 6 },
      };

      const result = await evaluateRuleForTests(rule);
      expect(result).toBeNull();
    });
  });
});
