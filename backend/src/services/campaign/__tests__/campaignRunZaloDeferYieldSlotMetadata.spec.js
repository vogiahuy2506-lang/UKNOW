import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPatchRunMetadata = jest.fn().mockResolvedValue(null);
const mockGetRunMetadata = jest.fn().mockResolvedValue({});

jest.unstable_mockModule('../../../repositories/campaign/campaignRun.repository.js', () => ({
  default: {
    patchRunMetadata: mockPatchRunMetadata,
    getRunMetadata: mockGetRunMetadata,
  },
}));

const { default: campaignRunService } = await import('../campaignRun.service.js');

describe('campaignRun.service — persistZaloDeferYieldSlot metadata (PR-A)', () => {
  beforeEach(() => {
    mockPatchRunMetadata.mockClear();
    mockGetRunMetadata.mockClear();
    mockGetRunMetadata.mockResolvedValue({});
  });

  it('gọi với accountId: 34, accountName: "SIM1" (khoá tra số) → patch đủ 5 khoá cũ + mốc chạy tiếp thật + ngày VN khoá tra số', async () => {
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
      'zaloOutboundResumeEffectiveAt',
      'phoneLookupDeferVnDays',
    ].sort());
    expect(typeof patch.zaloOutboundResumeEffectiveAt).toBe('string');
    expect(patch.phoneLookupDeferVnDays).toHaveLength(1);
  });

  it('gọi không có tài khoản, reason KHÔNG phải khoá tra số → 3 khoá cũ + mốc chạy tiếp thật, không có khoá null/undefined, không đếm ngày khoá tra số', async () => {
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
      'zaloOutboundResumeEffectiveAt',
    ]);
    expect(mockGetRunMetadata).not.toHaveBeenCalled();
  });
});
