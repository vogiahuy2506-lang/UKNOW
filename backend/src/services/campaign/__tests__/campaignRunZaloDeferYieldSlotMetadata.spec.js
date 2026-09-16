import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    patchRunMetadata: mockPatchRunMetadata,
  },
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('campaignRun.service — persistZaloDeferYieldSlot metadata (PR-A)', () => {
  beforeEach(() => {
    mockPatchRunMetadata.mockClear();
  });

  it('gọi với accountId: 34, accountName: "SIM1" → patch đủ 5 khoá', async () => {
    await expect(
      campaignRunService.persistZaloDeferYieldSlot({
        runId: 101,
        campaignId: 201,
        waitMs: 30000,
        reason: 'phone_lookup_cooldown_api_error',
        accountId: 34,
        accountName: 'SIM1',
      })
    ).rejects.toMatchObject({ code: 'RUN_YIELD_SLOT' });

    expect(mockPatchRunMetadata).toHaveBeenCalledTimes(1);
    const [runId, patch] = mockPatchRunMetadata.mock.calls[0];
    expect(runId).toBe(101);
    expect(patch).toMatchObject({
      zaloDeferredReason: 'phone_lookup_cooldown_api_error',
      zaloDeferredAccountId: 34,
      zaloDeferredAccountName: 'SIM1',
    });
    expect(typeof patch.zaloOutboundDeferredUntil).toBe('string');
    expect(typeof patch.zaloDeferredAt).toBe('string');
    expect(Object.keys(patch).sort()).toEqual([
      'zaloDeferredAccountId',
      'zaloDeferredAccountName',
      'zaloDeferredAt',
      'zaloDeferredReason',
      'zaloOutboundDeferredUntil',
    ]);
  });

  it('gọi không có tài khoản → đúng 3 khoá cũ, không có khoá null/undefined', async () => {
    await expect(
      campaignRunService.persistZaloDeferYieldSlot({
        runId: 102,
        campaignId: 202,
        waitMs: 15000,
        reason: 'quiet_hours',
      })
    ).rejects.toMatchObject({ code: 'RUN_YIELD_SLOT' });

    expect(mockPatchRunMetadata).toHaveBeenCalledTimes(1);
    const [runId, patch] = mockPatchRunMetadata.mock.calls[0];
    expect(runId).toBe(102);
    expect(patch).toMatchObject({
      zaloDeferredReason: 'quiet_hours',
    });
    expect(typeof patch.zaloOutboundDeferredUntil).toBe('string');
    expect(typeof patch.zaloDeferredAt).toBe('string');
    expect(patch).not.toHaveProperty('zaloDeferredAccountId');
    expect(patch).not.toHaveProperty('zaloDeferredAccountName');
    expect(Object.keys(patch).sort()).toEqual([
      'zaloDeferredAt',
      'zaloDeferredReason',
      'zaloOutboundDeferredUntil',
    ]);
  });
});
