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
const findStorageObjectById = jest.fn();
const listStorageObjectsForReconcile = jest.fn();
const listTrackedStorageKeys = jest.fn();
const markStorageObjectCleanupPending = jest.fn();
const markStorageObjectDeleted = jest.fn();
const markStorageObjectOrphaned = jest.fn();
const updateStorageObjectSize = jest.fn();
const buildStorageReferenceIndex = jest.fn();
const getIndexedStorageReferences = jest.fn();
const isStorageKeyReferencedByMessage = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { getClient: jest.fn(async () => client) },
}));
jest.unstable_mockModule('../../../repositories/storage.repository.js', () => ({
  acquireStorageQuotaLock,
  activateStorageObject,
  findStorageObjectById,
  listStorageObjectsForReconcile,
  listTrackedStorageKeys,
  markStorageObjectCleanupPending,
  markStorageObjectDeleted,
  markStorageObjectOrphaned,
  updateStorageObjectSize,
}));
jest.unstable_mockModule('../storageReference.service.js', () => ({
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isStorageKeyReferencedByMessage,
}));

const { reconcileStorageObjects } = await import('../storageReconcile.service.js');
const originalDeleteUntracked = process.env.STORAGE_RECONCILE_DELETE_UNTRACKED;

describe('storageReconcile.service', () => {
  let root;
  let roots;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.STORAGE_RECONCILE_DELETE_UNTRACKED;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-reconcile-'));
    roots = {
      uploads: path.join(root, 'uploads'),
      temp: path.join(root, 'temp_uploads'),
    };
    await fs.mkdir(roots.uploads, { recursive: true });
    await fs.mkdir(roots.temp, { recursive: true });
    buildStorageReferenceIndex.mockResolvedValue(new Map());
    getIndexedStorageReferences.mockReturnValue([]);
    isStorageKeyReferencedByMessage.mockResolvedValue(false);
    listTrackedStorageKeys.mockResolvedValue([]);
  });

  afterEach(async () => {
    if (originalDeleteUntracked === undefined) {
      delete process.env.STORAGE_RECONCILE_DELETE_UNTRACKED;
    } else {
      process.env.STORAGE_RECONCILE_DELETE_UNTRACKED = originalDeleteUntracked;
    }
    await fs.rm(root, { recursive: true, force: true });
  });

  it('orphans missing files, locks positive drift, and retries cleanup_pending', async () => {
    const driftPath = path.join(roots.uploads, '42', 'drift.bin');
    const cleanupPath = path.join(roots.uploads, '42', 'cleanup.bin');
    await fs.mkdir(path.dirname(driftPath), { recursive: true });
    await fs.writeFile(driftPath, '12345');
    await fs.writeFile(cleanupPath, 'remove-me');

    const rows = [
      {
        id: 1, pool_type: 'workspace', owner_user_id: 42, state: 'active',
        storage_key: 'uploads/42/missing.bin', temp_key: null, size_bytes: 10,
        reference_type: 'chat_attachment', reference_id: '91',
      },
      {
        id: 2, pool_type: 'workspace', owner_user_id: 42, state: 'active',
        storage_key: 'uploads/42/drift.bin', temp_key: null, size_bytes: 2,
      },
      {
        id: 3, pool_type: 'workspace', owner_user_id: 42, state: 'cleanup_pending',
        storage_key: 'uploads/42/cleanup.bin', temp_key: null, size_bytes: 9,
      },
    ];
    listStorageObjectsForReconcile
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);
    listTrackedStorageKeys.mockResolvedValue(rows.map((row) => ({
      storage_key: row.storage_key,
      temp_key: row.temp_key,
    })));
    findStorageObjectById.mockImplementation(async (id) => rows.find((row) => row.id === id));

    const metrics = await reconcileStorageObjects({ roots, batchSize: 10 });

    expect(markStorageObjectOrphaned).toHaveBeenCalledWith(1, client);
    expect(acquireStorageQuotaLock).toHaveBeenCalledWith(client, 42);
    expect(updateStorageObjectSize).toHaveBeenCalledWith(2, 5, client);
    expect(markStorageObjectDeleted).toHaveBeenCalledWith(3);
    await expect(fs.access(cleanupPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(metrics).toMatchObject({
      orphanedCount: 1,
      orphanedBytes: 10,
      driftCount: 1,
      driftDeltaBytes: 3,
      cleanupRetryDeleted: 1,
      cleanupRetryBytes: 9,
    });
  });

  it('reports old durable files without deleting them by default, while legacy temp cleanup continues', async () => {
    const recentPath = path.join(roots.uploads, '7', 'recent.bin');
    const referencedPath = path.join(roots.uploads, '7', 'referenced.bin');
    const stalePath = path.join(roots.uploads, '7', 'stale.bin');
    const staleTempPath = path.join(roots.temp, 'legacy.tmp');
    await fs.mkdir(path.dirname(recentPath), { recursive: true });
    await fs.writeFile(recentPath, 'new');
    await fs.writeFile(referencedPath, 'keep');
    await fs.writeFile(stalePath, 'old');
    await fs.writeFile(`${stalePath}.txt`, 'sidecar');
    await fs.writeFile(staleTempPath, 'legacy');

    const now = new Date('2026-08-14T03:00:00.000Z');
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    await fs.utimes(recentPath, recent, recent);
    await fs.utimes(referencedPath, old, old);
    await fs.utimes(stalePath, old, old);
    await fs.utimes(`${stalePath}.txt`, old, old);
    await fs.utimes(staleTempPath, old, old);

    listStorageObjectsForReconcile.mockResolvedValue([]);
    getIndexedStorageReferences.mockImplementation((_index, key) => (
      key === 'uploads/7/referenced.bin' ? [{ referenceType: 'landing_page' }] : []
    ));

    const metrics = await reconcileStorageObjects({ roots, now, orphanGraceHours: 24 });

    await expect(fs.access(recentPath)).resolves.toBeUndefined();
    await expect(fs.access(referencedPath)).resolves.toBeUndefined();
    await expect(fs.access(stalePath)).resolves.toBeUndefined();
    await expect(fs.access(`${stalePath}.txt`)).resolves.toBeUndefined();
    await expect(fs.access(staleTempPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(isStorageKeyReferencedByMessage).toHaveBeenCalledTimes(1);
    expect(metrics).toMatchObject({
      untrackedCount: 4,
      untrackedReferencedCount: 1,
      untrackedDeletedCount: 1,
      untrackedDeletedBytes: 6,
      untrackedDurableBytes: 17,
      untrackedDurableDeleteEnabled: false,
      untrackedDurableDeleteCandidateCount: 1,
      untrackedDurableDeleteCandidateBytes: 10,
      untrackedDurableDeleteCandidates: [{
        storageKey: 'uploads/7/stale.bin',
        sizeBytes: 10,
        modifiedAt: old.toISOString(),
      }],
    });
  });

  it('deletes old unreferenced durable files only when the dedicated gate is enabled', async () => {
    const stalePath = path.join(roots.uploads, '7', 'stale.bin');
    await fs.mkdir(path.dirname(stalePath), { recursive: true });
    await fs.writeFile(stalePath, 'old');
    await fs.writeFile(`${stalePath}.txt`, 'sidecar');

    const now = new Date('2026-08-14T03:00:00.000Z');
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    await fs.utimes(stalePath, old, old);
    await fs.utimes(`${stalePath}.txt`, old, old);
    listStorageObjectsForReconcile.mockResolvedValue([]);
    process.env.STORAGE_RECONCILE_DELETE_UNTRACKED = 'true';

    const metrics = await reconcileStorageObjects({
      roots,
      now,
      orphanGraceHours: 24,
    });

    await expect(fs.access(stalePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(`${stalePath}.txt`)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(metrics).toMatchObject({
      untrackedDurableDeleteEnabled: true,
      untrackedDurableDeleteCandidateCount: 1,
      untrackedDurableDeleteCandidateBytes: 10,
      untrackedDeletedCount: 1,
      untrackedDeletedBytes: 10,
      untrackedDurableBytes: 0,
    });
  });
});
