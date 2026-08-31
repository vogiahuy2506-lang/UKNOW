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
});
