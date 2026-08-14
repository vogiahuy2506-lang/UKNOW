import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const client = {
  query: jest.fn(async () => ({ rows: [] })),
  release: jest.fn(),
};
const acquireStorageQuotaLock = jest.fn();
const activateStorageObject = jest.fn();
const clearTempKey = jest.fn();
const findStorageObjectByKey = jest.fn();
const findStorageObjectByTempKey = jest.fn();
const insertStorageObject = jest.fn();
const markStorageObjectCleanupPending = jest.fn();
const markStorageObjectDeleted = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => client) },
}));
jest.unstable_mockModule('../../../utils/storageCapacity.util.js', () => ({
  STORAGE_POOL_TYPES: { WORKSPACE: 'workspace', SYSTEM: 'system' },
  assertStorageCapacity: jest.fn(),
}));
jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  acquireStorageQuotaLock,
  activateStorageObject,
  clearTempKey,
  findStorageObjectByKey,
  findStorageObjectByTempKey,
  insertStorageObject,
  markStorageObjectCleanupPending,
  markStorageObjectDeleted,
}));
jest.unstable_mockModule('../storageQuota.service.js', () => ({
  assertQuotaAvailable: jest.fn(),
  getStorageUsage: jest.fn(),
  StorageQuotaExceededError: class StorageQuotaExceededError extends Error {},
}));

const {
  markDeletedAfterUnlink,
  promoteTempStorageObjects,
} = await import('../storageObject.service.js');

describe('storageObject.service promote transaction', () => {
  let root;

  beforeEach(async () => {
    jest.clearAllMocks();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-object-test-'));
    findStorageObjectByTempKey.mockImplementation(async (tempKey) => ({
      id: tempKey === 'one.tmp' ? 1 : 2,
      pool_type: 'workspace',
      owner_user_id: 42,
      state: 'temp',
      storage_key: null,
    }));
    activateStorageObject.mockImplementation(async ({ id, storageKey }) => ({
      id,
      storage_key: storageKey,
      state: 'active',
    }));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function createItems() {
    const tempOne = path.join(root, 'one.tmp');
    const tempTwo = path.join(root, 'two.tmp');
    await fs.writeFile(tempOne, 'one');
    await fs.writeFile(tempTwo, 'two');
    return [
      {
        tempKey: 'one.tmp',
        tempPath: tempOne,
        storageKey: 'uploads/42/one.txt',
        targetPath: path.join(root, 'uploads', 'one.txt'),
        category: 'email_template',
      },
      {
        tempKey: 'two.tmp',
        tempPath: tempTwo,
        storageKey: 'uploads/42/two.txt',
        targetPath: path.join(root, 'uploads', 'two.txt'),
        category: 'email_template',
      },
    ];
  }

  it('rolls back every permanent copy and preserves temps when parent mutation fails', async () => {
    const items = await createItems();
    const parentError = new Error('parent failed');

    await expect(promoteTempStorageObjects({
      items,
      ownerUserId: 42,
      parentMutation: jest.fn(async () => { throw parentError; }),
    })).rejects.toBe(parentError);

    await expect(fs.access(items[0].tempPath)).resolves.toBeUndefined();
    await expect(fs.access(items[1].tempPath)).resolves.toBeUndefined();
    await expect(fs.access(items[0].targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(items[1].targetPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(activateStorageObject).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('commits parent and all ledger activations before removing temps', async () => {
    const items = await createItems();
    const parentMutation = jest.fn(async (transactionClient) => {
      expect(transactionClient).toBe(client);
      return { referenceId: 77 };
    });

    const objects = await promoteTempStorageObjects({
      items,
      ownerUserId: 42,
      referenceType: 'email_template',
      parentMutation,
    });

    expect(objects).toHaveLength(2);
    expect(parentMutation).toHaveBeenCalledTimes(1);
    expect(activateStorageObject).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 1,
      referenceType: 'email_template',
      referenceId: 77,
    }), client);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    await expect(fs.access(items[0].tempPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(items[0].targetPath)).resolves.toBeUndefined();
    expect(clearTempKey).toHaveBeenCalledTimes(2);
  });

  it('clears stale temp_key without deleting an active permanent object', async () => {
    const staleTempPath = path.join(root, 'stale.tmp');
    await fs.writeFile(staleTempPath, 'stale');
    findStorageObjectByTempKey.mockResolvedValueOnce({
      id: 9,
      state: 'active',
      storage_key: 'uploads/42/active.txt',
    });

    await markDeletedAfterUnlink({ tempKey: 'stale.tmp', physicalPaths: [staleTempPath] });

    expect(clearTempKey).toHaveBeenCalledWith(9);
    expect(markStorageObjectDeleted).not.toHaveBeenCalled();
    expect(markStorageObjectCleanupPending).not.toHaveBeenCalled();
  });
});
