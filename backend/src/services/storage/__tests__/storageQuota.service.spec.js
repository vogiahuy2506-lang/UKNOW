import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetEffectiveQuota = jest.fn();
const mockGetWorkspaceUsage = jest.fn();
const mockSumActiveTopupGrants = jest.fn();

jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  getEffectiveQuota: mockGetEffectiveQuota,
  getWorkspaceUsage: mockGetWorkspaceUsage,
}));

jest.unstable_mockModule('../../../repositories/payment/topup.repository.js', () => ({
  sumActiveTopupGrants: mockSumActiveTopupGrants,
}));

const {
  DEFAULT_STORAGE_LIMIT_BYTES,
  BYTES_PER_GB,
  StorageQuotaExceededError,
  assertQuotaAvailable,
  getStorageUsage,
  resolveWorkspaceOwnerId,
} = await import('../storageQuota.service.js');

describe('storageQuota.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSumActiveTopupGrants.mockResolvedValue(0);
  });

  it('resolves employee usage to the active workspace owner', () => {
    expect(resolveWorkspaceOwnerId({ id: 9, activeContext: { type: 'employee', ownerId: 42 } })).toBe(42);
    expect(resolveWorkspaceOwnerId({ id: 9, activeContext: { type: 'self' } })).toBe(9);
  });

  it('uses override before effective billing plan and returns a narrow usage DTO', async () => {
    mockGetEffectiveQuota.mockResolvedValueOnce({ overrideBytes: '200', planLimitBytes: '100' });
    mockGetWorkspaceUsage.mockResolvedValueOnce('50');
    await expect(getStorageUsage(1)).resolves.toEqual({
      usedBytes: 50, reservedBytes: 0, limitBytes: 200, remainingBytes: 150,
      percent: 25, overLimit: false, source: 'override',
      enforcementEnabled: false,
    });
  });

  it('adds active topup grants on top of plan limits and updates source', async () => {
    mockGetEffectiveQuota.mockResolvedValueOnce({ overrideBytes: null, planLimitBytes: '1073741824' }); // 1 GB
    mockGetWorkspaceUsage.mockResolvedValueOnce('500000000');
    mockSumActiveTopupGrants.mockResolvedValueOnce(5); // +5 GB

    const expectedLimit = 1073741824 + 5 * BYTES_PER_GB;
    const usage = await getStorageUsage(1);

    expect(mockSumActiveTopupGrants).toHaveBeenCalledWith(1, 'storage_gb', expect.anything());
    expect(usage.limitBytes).toBe(expectedLimit);
    expect(usage.source).toBe('plan+topup');
  });

  it('adds active topup grants on top of override limits and updates source', async () => {
    mockGetEffectiveQuota.mockResolvedValueOnce({ overrideBytes: '5368709120', planLimitBytes: '1073741824' }); // 5 GB override
    mockGetWorkspaceUsage.mockResolvedValueOnce('0');
    mockSumActiveTopupGrants.mockResolvedValueOnce(10); // +10 GB

    const expectedLimit = 5368709120 + 10 * BYTES_PER_GB;
    const usage = await getStorageUsage(1);

    expect(usage.limitBytes).toBe(expectedLimit);
    expect(usage.source).toBe('override+topup');
  });

  it('falls back to the safe 100MB plan limit when no plan resolves', async () => {
    mockGetEffectiveQuota.mockResolvedValueOnce(null);
    mockGetWorkspaceUsage.mockResolvedValueOnce('0');
    await expect(getStorageUsage(1)).resolves.toMatchObject({ limitBytes: DEFAULT_STORAGE_LIMIT_BYTES, source: 'plan' });
  });

  it('returns enforcementEnabled: true when STORAGE_QUOTA_ENFORCEMENT_ENABLED is true', async () => {
    const previous = process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
    process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    mockGetEffectiveQuota.mockResolvedValueOnce({ overrideBytes: '200', planLimitBytes: '100' });
    mockGetWorkspaceUsage.mockResolvedValueOnce('50');
    try {
      const usage = await getStorageUsage(1);
      expect(usage.enforcementEnabled).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
      else process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = previous;
    }
  });

  it('rejects an over-limit write when enforcement is enabled', () => {
    const previous = process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
    process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = 'true';
    expect(() => assertQuotaAvailable({ usage: { usedBytes: 90, limitBytes: 100 }, requestedBytes: 11 }))
      .toThrow(StorageQuotaExceededError);
    if (previous === undefined) delete process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED;
    else process.env.STORAGE_QUOTA_ENFORCEMENT_ENABLED = previous;
  });
});
