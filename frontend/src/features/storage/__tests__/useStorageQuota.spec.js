import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetStorageUsage = vi.fn();

vi.mock('../storage.service.js', () => ({
  getStorageUsage: () => mockGetStorageUsage(),
}));

describe('useStorageQuota module functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches storage quota and caches result across multiple calls', async () => {
    const { fetchStorageQuota, clearStorageQuotaCache } = await import('../useStorageQuota.js');
    clearStorageQuotaCache();

    const mockUsage = {
      usedBytes: 10 * 1024 * 1024,
      limitBytes: 100 * 1024 * 1024,
      remainingBytes: 90 * 1024 * 1024,
      percent: 10,
      overLimit: false,
      source: 'plan',
    };
    mockGetStorageUsage.mockResolvedValue(mockUsage);

    const first = await fetchStorageQuota();
    expect(first).toEqual(mockUsage);
    expect(mockGetStorageUsage).toHaveBeenCalledTimes(1);

    // Second call without force uses cache
    const second = await fetchStorageQuota();
    expect(second).toEqual(mockUsage);
    expect(mockGetStorageUsage).toHaveBeenCalledTimes(1);
  });

  it('refetches when refreshStorageQuota() is called', async () => {
    const { fetchStorageQuota, refreshStorageQuota, clearStorageQuotaCache } = await import('../useStorageQuota.js');
    clearStorageQuotaCache();

    const mockUsage1 = { percent: 10 };
    const mockUsage2 = { percent: 20 };
    mockGetStorageUsage
      .mockResolvedValueOnce(mockUsage1)
      .mockResolvedValueOnce(mockUsage2);

    await fetchStorageQuota();
    expect(mockGetStorageUsage).toHaveBeenCalledTimes(1);

    const refreshed = await refreshStorageQuota();
    expect(refreshed).toEqual(mockUsage2);
    expect(mockGetStorageUsage).toHaveBeenCalledTimes(2);
  });

  it('fails open on network error without throwing', async () => {
    const { fetchStorageQuota, clearStorageQuotaCache } = await import('../useStorageQuota.js');
    clearStorageQuotaCache();

    mockGetStorageUsage.mockRejectedValue(new Error('Network error'));

    const result = await fetchStorageQuota();
    expect(result).toBeNull();
  });
});
