import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const { metricCampaignRunFailures, metricCampaignRepeatedFailures, metricStalledRuns, metricPaidAfterCancelledOrders, metricLatestAffiliateClosingErrors } = await import('../alert.repository.js');

describe('PR-4: Alert repository failure metrics SQL behavior', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

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

  it('metricStalledRuns dùng đúng cột campaign_name của bảng campaigns', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: '105',
          id_campaign: '2',
          campaign_name: 'Flash Sale Tháng 8',
          total_recipients: '100',
          successful_sends: '10',
          failed_sends: '1',
          started_at: '2026-08-30T00:00:00.000Z',
          last_execution_at: null,
        },
      ],
    });

    await expect(metricStalledRuns(48)).resolves.toEqual([
      {
        runId: '105',
        campaignId: '2',
        campaignName: 'Flash Sale Tháng 8',
        startedAt: '2026-08-30T00:00:00.000Z',
        lastExecutionAt: null,
        totalRecipients: 100,
        successfulSends: 10,
        failedSends: 1,
      },
    ]);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('c.campaign_name AS campaign_name');
    expect(sql).toContain('c.campaign_name');
    expect(sql).not.toMatch(/\bc\.name\b/);
    expect(sql).toContain("cr.run_metadata->>'nonContinuousDeferredUntil'");
    expect(sql).toContain("cr.run_metadata->>'quotaDeferredUntil'");
    expect(sql).toContain("cr.run_metadata->>'zaloOutboundDeferredUntil'");
    expect(sql).toContain('make_timestamptz');
    expect(sql).not.toContain("(cr.run_metadata->>'nonContinuousDeferredUntil')::timestamptz");
  });

  // PR-4 (đợt rà soát 26/09)
  describe('metricPaidAfterCancelledOrders', () => {
    it('lọc đúng status IN cancelled/failed + tag note + cận trên maxAgeHours', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ order_code: '999', amount: '199000', status: 'cancelled', updated_at: '2026-09-26T00:00:00.000Z' }],
      });

      const res = await metricPaidAfterCancelledOrders(168);
      expect(res).toEqual([{ orderCode: '999', amount: 199000, status: 'cancelled', updatedAt: '2026-09-26T00:00:00.000Z' }]);

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("status IN ('cancelled', 'failed')");
      expect(sql).toContain("note LIKE '%PAID_AFTER_CANCELLED%'");
      // "Nợ nhỏ" PR-4 (26/09) — đơn admin đã bấm "Đánh dấu đã xử lý" (tag
      // PAID_AFTER_CANCELLED_HANDLED) phải bị loại khỏi cảnh báo, không đợi hết 168h.
      expect(sql).toContain("note NOT LIKE '%PAID_AFTER_CANCELLED_HANDLED%'");
      expect(sql).toContain("updated_at >= NOW() - ($1 || ' hours')::interval");
      expect(params).toEqual(['168']);
    });

    it('dùng mặc định 168 giờ khi không truyền tham số', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await metricPaidAfterCancelledOrders();
      expect(mockQuery.mock.calls[0][1]).toEqual(['168']);
    });
  });

  // "Nợ nhỏ" PR-4 (26/09) — item 4: affiliate closing đóng sổ, referrer lỗi chỉ console.error
  describe('metricLatestAffiliateClosingErrors', () => {
    it('đọc erroredReferrers từ result của lượt chạy gần nhất đã kết thúc', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ status: 'success', result: { erroredReferrers: 2, monthKey: '2026-08' } }],
      });

      const res = await metricLatestAffiliateClosingErrors();
      expect(res).toEqual({
        erroredReferrers: 2,
        found: true,
        result: { erroredReferrers: 2, monthKey: '2026-08' },
      });

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain("job_code = $1");
      // Chỉ đọc run đã kết thúc — dòng 'running' (result mặc định '{}') sẽ che lỗi thật của
      // lượt trước, giống bug đã vá ở metricLatestEinvoiceSeries.
      expect(sql).toContain('finished_at IS NOT NULL');
      expect(params).toEqual(['affiliate_month_closing']);
    });

    it('không có lượt chạy nào → found=false, erroredReferrers=0', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await metricLatestAffiliateClosingErrors();
      expect(res).toEqual({ erroredReferrers: 0, found: false, result: null });
    });

    it('result thiếu erroredReferrers (job cũ trước khi có field này) → mặc định 0, không throw', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ status: 'noop', result: {} }],
      });
      const res = await metricLatestAffiliateClosingErrors();
      expect(res).toEqual({ erroredReferrers: 0, found: true, result: {} });
    });
  });
});
