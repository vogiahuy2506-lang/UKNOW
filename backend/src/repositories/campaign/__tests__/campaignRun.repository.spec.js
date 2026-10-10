import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const campaignRunRepository = (await import('../campaignRun.repository.js')).default;

describe('CampaignRunRepository finalizeRun', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    campaignRunRepository._hasSkippedSendsColumn = true;
  });

  it('ghi marker defer cùng UPDATE giữ run running', async () => {
    const deferPatch = {
      nonContinuousDeferredUntil: '2030-01-01T00:00:00.000Z',
      nonContinuousDeferredReason: 'all_recipients_waiting_next_due',
    };
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await campaignRunRepository.finalizeRun(
      42,
      true,
      { totalRecipients: 8, successfulSends: 3, failedSends: 1, skippedSends: 4 },
      deferPatch
    );

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("run_metadata = COALESCE(run_metadata, '{}'::jsonb) || $5::jsonb");
    expect(sql).toContain('WHERE id = $6');
    expect(params).toEqual([
      8,
      3,
      1,
      4,
      JSON.stringify(deferPatch),
      42,
    ]);
  });

  it('giữ patch atomically cả ở schema cũ chưa có skipped_sends', async () => {
    campaignRunRepository._hasSkippedSendsColumn = false;
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await campaignRunRepository.finalizeRun(
      43,
      true,
      { totalRecipients: 8, successfulSends: 3, failedSends: 1, skippedSends: 4 },
      { nonContinuousDeferredUntil: '2030-01-01T00:00:00.000Z' }
    );

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("run_metadata = COALESCE(run_metadata, '{}'::jsonb) || $4::jsonb");
    expect(sql).toContain('WHERE id = $5');
    expect(params).toEqual([
      8,
      3,
      1,
      JSON.stringify({ nonContinuousDeferredUntil: '2030-01-01T00:00:00.000Z' }),
      43,
    ]);
  });

  // PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1 — engine chỉ phát "chiến dịch chạy xong" khi UPDATE vừa ghi 'completed' THẬT.
  describe('giá trị trả về (cho thông báo "chạy xong")', () => {
    const counts = { totalRecipients: 8, successfulSends: 3, failedSends: 1, skippedSends: 4 };

    it("kết thúc hẳn (không còn người nhận chờ) → SQL có RETURNING status và trả { status: 'completed' }", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'completed' }] });

      const result = await campaignRunRepository.finalizeRun(50, false, counts);

      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toContain("status = 'completed'");
      expect(sql).toContain("AND status = 'running'");
      expect(sql).toContain('RETURNING status');
      expect(result).toEqual({ status: 'completed' });
    });

    it("còn người nhận chờ thử lại → giữ running và trả { status: 'running' } (KHÔNG phải completed)", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'running' }] });

      const result = await campaignRunRepository.finalizeRun(51, true, counts, { nonContinuousDeferredUntil: 'x' });

      expect(mockQuery.mock.calls[0][0]).toContain('RETURNING status');
      expect(result).toEqual({ status: 'running' });
    });

    it('lượt đã bị dừng/huỷ/đóng sổ bởi luồng khác (UPDATE không chạm dòng nào) → trả null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      expect(await campaignRunRepository.finalizeRun(52, false, counts)).toBeNull();
    });

    it("schema cũ chưa có skipped_sends cũng trả { status: 'completed' } và có RETURNING status", async () => {
      campaignRunRepository._hasSkippedSendsColumn = false;
      mockQuery.mockResolvedValueOnce({ rows: [{ status: 'completed' }] });

      const result = await campaignRunRepository.finalizeRun(53, false, counts);

      expect(mockQuery.mock.calls[0][0]).toContain('RETURNING status');
      expect(result).toEqual({ status: 'completed' });
    });
  });
});

describe('CampaignRunRepository getRunForExecution', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // PR-2 — thiếu total_recipients/skipped_sends trong SELECT này khiến cả hai bộ đếm về 0 mỗi
  // lượt gọi lại (resume) dù DB đã có giá trị cộng dồn từ lượt trước (Việc 1 của PR-2).
  it('SELECT phải kèm total_recipients và skipped_sends để service nạp đúng khi resume', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 200 }] });

    await campaignRunRepository.getRunForExecution(200);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('total_recipients');
    expect(sql).toContain('skipped_sends');
  });

  // PLAN_GIAO_TAI_KHOAN_ZALO_CHO_NHAN_VIEN PR-G3 — engine kiểm tài khoản Zalo được giao theo người bấm chạy / người tạo lịch.
  it('SELECT kèm triggered_by và schedule_created_by (người tạo lịch của lượt) cho kiểm tài khoản được giao', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 200 }] });

    await campaignRunRepository.getRunForExecution(200);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('cr.triggered_by');
    expect(sql).toMatch(/campaign_schedules cs WHERE cs\.id = cr\.id_schedule\) AS schedule_created_by/);
    expect(sql).toContain('cr.run_metadata');
  });
});
