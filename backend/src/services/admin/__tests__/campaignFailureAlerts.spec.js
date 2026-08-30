import { describe, expect, it, jest } from '@jest/globals';

const mockMetricCampaignRunFailures = jest.fn();
const mockMetricCampaignRepeatedFailures = jest.fn();

jest.unstable_mockModule('../../../repositories/admin/alert.repository.js', () => ({
  metricCampaignRunFailures: mockMetricCampaignRunFailures,
  metricCampaignRepeatedFailures: mockMetricCampaignRepeatedFailures,
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

describe('PR-4: Campaign failure alert metrics & evaluator', () => {
  describe('metricCampaignRunFailures & metricCampaignRepeatedFailures exports', () => {
    it('alert.repository exports the two new failure metrics', () => {
      expect(typeof alertRepo.metricCampaignRunFailures).toBe('function');
      expect(typeof alertRepo.metricCampaignRepeatedFailures).toBe('function');
    });
  });

  describe('evaluateRuleForTests', () => {
    it('campaign_run_failures: vượt ngưỡng → sinh cảnh báo', async () => {
      mockMetricCampaignRunFailures.mockResolvedValueOnce({
        failed: 4,
        campaigns: 2,
      });

      const rule = {
        code: 'campaign_run_failures',
        thresholdValue: 3,
        windowMinutes: 60,
        config: {},
      };

      const result = await evaluateRuleForTests(rule);
      expect(result).not.toBeNull();
      expect(result.measuredValue).toBe(4);
      expect(result.message).toContain('4 lượt chạy chiến dịch thất bại');
      expect(result.payload.failed).toBe(4);
    });

    it('campaign_run_failures: dưới ngưỡng → trả null', async () => {
      mockMetricCampaignRunFailures.mockResolvedValueOnce({
        failed: 2,
        campaigns: 1,
      });

      const rule = {
        code: 'campaign_run_failures',
        thresholdValue: 3,
        windowMinutes: 60,
        config: {},
      };

      const result = await evaluateRuleForTests(rule);
      expect(result).toBeNull();
    });

    it('campaign_repeated_failures: có campaign hỏng nhiều ngày → sinh cảnh báo', async () => {
      mockMetricCampaignRepeatedFailures.mockResolvedValueOnce([
        { campaignId: '42', failedDays: 3, failedRuns: 5 },
      ]);

      const rule = {
        code: 'campaign_repeated_failures',
        thresholdValue: 1,
        windowMinutes: 1440,
        config: { days: 3 },
      };

      const result = await evaluateRuleForTests(rule);
      expect(result).not.toBeNull();
      expect(result.measuredValue).toBe(1);
      expect(result.message).toContain('1 chiến dịch hỏng liên tiếp trong 3 ngày qua');
      expect(result.payload.campaigns).toHaveLength(1);
    });

    it('campaign_repeated_failures: không có campaign hỏng → trả null', async () => {
      mockMetricCampaignRepeatedFailures.mockResolvedValueOnce([]);

      const rule = {
        code: 'campaign_repeated_failures',
        thresholdValue: 1,
        windowMinutes: 1440,
        config: { days: 3 },
      };

      const result = await evaluateRuleForTests(rule);
      expect(result).toBeNull();
    });
  });
});
