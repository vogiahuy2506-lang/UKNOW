import { describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const { metricCampaignRunFailures, metricCampaignRepeatedFailures } = await import('../alert.repository.js');

describe('PR-4: Alert repository failure metrics SQL behavior', () => {
  it('metricCampaignRunFailures query không lọc total_recipients > 0 (đếm được run chết sớm 0 recipient)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ failed: '3', campaigns: '2' }],
    });

    const res = await metricCampaignRunFailures(60);
    expect(res).toEqual({ failed: 3, campaigns: 2 });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("FILTER (WHERE status = 'failed')");
    expect(sql).not.toContain('total_recipients > 0');
  });

  it('metricCampaignRepeatedFailures tìm campaign có run failed >= days khác nhau và không có run completed', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id_campaign: '10', failed_days: '3', failed_runs: '4' },
      ],
    });

    const res = await metricCampaignRepeatedFailures(3);
    expect(res).toEqual([
      { campaignId: '10', failedDays: 3, failedRuns: 4 },
    ]);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("status = 'failed'");
  });
});
