import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  __resetStorageCapacityForTests,
  __setStorageCapacityReaderForTests,
  assertStorageCapacity,
  getStorageCapacityForPath,
  getStorageCapacityState,
  StorageCapacityError,
  STORAGE_POOL_TYPES,
} from '../storageCapacity.util.js';

afterEach(() => {
  __resetStorageCapacityForTests();
  delete process.env.STORAGE_DISK_STATS_CACHE_MS;
  delete process.env.STORAGE_DISK_WARNING_PERCENT;
  delete process.env.STORAGE_DISK_USER_BLOCK_PERCENT;
  delete process.env.STORAGE_DISK_SYSTEM_BLOCK_PERCENT;
  delete process.env.STORAGE_DISK_CRITICAL_PERCENT;
});

const snapshot = (percent) => ({
  filesystem: '/dev/test',
  mount: '/',
  total: 1000,
  used: percent * 10,
  available: 1000 - percent * 10,
  percent,
});

describe('storage capacity policy', () => {
  it('uses workspace 80%, system 85%, and critical 90% by default', () => {
    expect(getStorageCapacityState(snapshot(79), STORAGE_POOL_TYPES.WORKSPACE)).toBe('warning');
    expect(getStorageCapacityState(snapshot(80), STORAGE_POOL_TYPES.WORKSPACE)).toBe('blocked');
    expect(getStorageCapacityState(snapshot(80), STORAGE_POOL_TYPES.SYSTEM)).toBe('warning');
    expect(getStorageCapacityState(snapshot(85), STORAGE_POOL_TYPES.SYSTEM)).toBe('blocked');
    expect(getStorageCapacityState(snapshot(90), STORAGE_POOL_TYPES.SYSTEM)).toBe('critical');
  });

  it('caches a healthy df result for the configured interval', async () => {
    process.env.STORAGE_DISK_STATS_CACHE_MS = '60000';
    const reader = jest.fn().mockResolvedValue(snapshot(40));
    __setStorageCapacityReaderForTests(reader);

    await getStorageCapacityForPath('/tmp/storage-capacity-cache');
    await getStorageCapacityForPath('/tmp/storage-capacity-cache');

    expect(reader).toHaveBeenCalledTimes(1);
  });

  it('fails closed when disk stats cannot be read', async () => {
    __setStorageCapacityReaderForTests(async () => {
      throw new Error('df unavailable');
    });

    await expect(assertStorageCapacity({ paths: ['/tmp/storage-capacity-unavailable'] }))
      .rejects
      .toMatchObject({ code: 'STORAGE_CAPACITY_UNKNOWN', status: 503 });
  });

  it('blocks workspace capacity at threshold without exposing disk values', async () => {
    __setStorageCapacityReaderForTests(async () => snapshot(80));

    await expect(assertStorageCapacity({ paths: ['/tmp/storage-capacity-blocked'] }))
      .rejects
      .toBeInstanceOf(StorageCapacityError);
    await expect(assertStorageCapacity({ paths: ['/tmp/storage-capacity-blocked'] }))
      .rejects
      .toMatchObject({ code: 'STORAGE_CAPACITY_PROTECTED', status: 503 });
  });
});
