import { promises as fs } from 'fs';
import path from 'path';
import db from '../../config/database.js';
import { STORAGE_POOL_TYPES, assertStorageCapacity } from '../../utils/storageCapacity.util.js';
import {
  acquireStorageQuotaLock,
  activateStorageObject,
  clearTempKey,
  findStorageObjectByKey,
  findStorageObjectByTempKey,
  insertStorageObject,
  markStorageObjectCleanupPending,
  markStorageObjectDeleted,
} from '../../repositories/storage.repository.js';
import {
  assertQuotaAvailable,
  getStorageUsage,
  StorageQuotaExceededError,
} from './storageQuota.service.js';
import { getStorageBackend } from './storageBackend.js';

const COUNTED_STATES = new Set(['active', 'temp', 'cleanup_pending']);

async function unlinkAll(paths) {
  let failure = null;
  for (const filePath of paths.filter(Boolean)) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') failure = error;
    }
  }
  if (failure) throw failure;
}

async function withTransaction(work) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Register bytes already written to disk. Shadow mode still writes the ledger.
 * In enforcement mode a rejected file is removed first; a failed unlink remains
 * represented as cleanup_pending so physical bytes never disappear from usage.
 */
export async function registerWrittenStorageObject({
  poolType = STORAGE_POOL_TYPES.WORKSPACE,
  ownerUserId = null,
  actorUserId = null,
  storageKey = null,
  tempKey = null,
  category,
  state,
  sizeBytes,
  expiresAt = null,
  referenceType = null,
  referenceId = null,
  physicalPaths = [],
}) {
  const bytes = Number(sizeBytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('sizeBytes không hợp lệ');
  if (poolType === STORAGE_POOL_TYPES.WORKSPACE && !ownerUserId) {
    throw new Error('Workspace storage object cần owner');
  }

  let rejected = null;
  const object = await withTransaction(async (client) => {
    if (poolType === STORAGE_POOL_TYPES.WORKSPACE) {
      await acquireStorageQuotaLock(client, ownerUserId);
      const usage = await getStorageUsage(ownerUserId, client);
      try {
        assertQuotaAvailable({ usage, requestedBytes: bytes });
      } catch (error) {
        if (!(error instanceof StorageQuotaExceededError)) throw error;
        try {
          await unlinkAll(physicalPaths);
        } catch (unlinkError) {
          await insertStorageObject({
            poolType, ownerUserId, actorUserId, storageKey, tempKey, category,
            state: 'cleanup_pending', sizeBytes: bytes, expiresAt, referenceType, referenceId,
          }, client);
        }
        rejected = error;
        return null;
      }
    }
    return insertStorageObject({
      poolType, ownerUserId, actorUserId, storageKey, tempKey, category, state,
      sizeBytes: bytes, expiresAt, referenceType, referenceId,
    }, client);
  });
  if (rejected) throw rejected;
  return object;
}

export async function getPhysicalSize(paths) {
  let total = 0;
  for (const filePath of paths.filter(Boolean)) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) total += stats.size;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return total;
}

export async function ensureTrackedTempStorageObject({
  tempKey,
  tempPath,
  ownerUserId = null,
  actorUserId = null,
  poolType = STORAGE_POOL_TYPES.WORKSPACE,
  category = 'temp',
  expiresAt = null,
}) {
  const existing = await findStorageObjectByTempKey(tempKey);
  if (existing) return existing;
  const sizeBytes = await getPhysicalSize([tempPath]);
  return registerWrittenStorageObject({
    poolType,
    ownerUserId,
    actorUserId,
    tempKey,
    category,
    state: 'temp',
    sizeBytes,
    expiresAt,
    physicalPaths: [tempPath],
  });
}

export async function markDeletedAfterUnlink({ storageKey = null, tempKey = null, physicalPaths = [], keys = null }) {
  const object = storageKey
    ? await findStorageObjectByKey(storageKey)
    : await findStorageObjectByTempKey(tempKey);
  try {
    if (keys || storageKey) {
      const keysToDelete = keys || [storageKey, `${storageKey}.txt`].filter(Boolean);
      await getStorageBackend().delete(keysToDelete);
    }
    if (physicalPaths && physicalPaths.length > 0) {
      await unlinkAll(physicalPaths);
    }
  } catch (error) {
    // A promoted object can retain temp_key when post-commit temp cleanup failed.
    // Keep it active so retry only targets the stale temp copy, not the durable file.
    if (object && !(tempKey && object.state === 'active' && object.storage_key)) {
      await markStorageObjectCleanupPending(object.id);
    }
    throw error;
  }
  if (object && tempKey && object.state === 'active' && object.storage_key) {
    await clearTempKey(object.id);
  } else if (object && COUNTED_STATES.has(object.state)) {
    await markStorageObjectDeleted(object.id);
  }
  return object;
}

function isRemoteBackend() {
  const backend = getStorageBackend();
  return Boolean(backend?.isRemote || backend?.type === 'gcs' || backend?.constructor?.name === 'GcsStorageBackend');
}

/** Copy a temp batch, commit all ledger rows plus parent work, then remove temp copies. */
export async function promoteTempStorageObjects({
  items,
  expiresAt = null,
  referenceType = null,
  referenceId = null,
  poolType = STORAGE_POOL_TYPES.WORKSPACE,
  ownerUserId = null,
  actorUserId = null,
  parentMutation = null,
}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (!isRemoteBackend()) {
    for (const item of items) {
      item.targetPath = getStorageBackend().resolveAbsolutePathFromKey(item.storageKey);
    }
    await assertStorageCapacity({ paths: items.map((item) => item.targetPath), poolType });
  }

  const copiedTargetPaths = [];
  const copiedStorageKeys = [];
  try {
    for (const item of items) {
      if (isRemoteBackend()) {
        const buffer = await fs.readFile(item.tempPath);
        await getStorageBackend().put(item.storageKey, buffer, { contentType: item.contentType });
        copiedStorageKeys.push(item.storageKey);
      } else {
        await fs.mkdir(path.dirname(item.targetPath), { recursive: true });
        await fs.copyFile(item.tempPath, item.targetPath);
        copiedTargetPaths.push(item.targetPath);
      }
    }
  } catch (error) {
    if (isRemoteBackend()) {
      await getStorageBackend().delete(copiedStorageKeys).catch(() => {});
    } else {
      await unlinkAll(copiedTargetPaths).catch(() => {});
    }
    throw error;
  }

  let objects;
  try {
    objects = await withTransaction(async (client) => {
      if (poolType === STORAGE_POOL_TYPES.WORKSPACE) {
        await acquireStorageQuotaLock(client, ownerUserId);
      }

      const existingRows = [];
      for (const item of items) {
        const existing = await findStorageObjectByTempKey(item.tempKey, client, { forUpdate: true });
        if (!existing) throw new Error(`Không tìm thấy ledger cho temp ${item.tempKey}`);
        if (existing.state !== 'temp') throw new Error(`Temp ${item.tempKey} đã được promote`);
        if (existing.pool_type !== poolType) throw new Error('Storage pool của temp không khớp');
        if (
          poolType === STORAGE_POOL_TYPES.WORKSPACE
          && Number(existing.owner_user_id) !== Number(ownerUserId)
        ) {
          throw new Error('Workspace owner của temp không khớp');
        }
        existingRows.push(existing);
      }

      const parentResult = parentMutation ? await parentMutation(client) : null;
      const resolvedReferenceType = parentResult?.referenceType ?? referenceType;
      const resolvedReferenceId = parentResult?.referenceId ?? parentResult?.id ?? referenceId;
      const activated = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        activated.push(await activateStorageObject({
          id: existingRows[index].id,
          storageKey: item.storageKey,
          category: item.category,
          expiresAt: item.expiresAt ?? expiresAt,
          referenceType: item.referenceType ?? resolvedReferenceType,
          referenceId: item.referenceId ?? resolvedReferenceId,
        }, client));
      }
      return activated;
    });
  } catch (error) {
    if (isRemoteBackend()) {
      await getStorageBackend().delete(copiedStorageKeys).catch(() => {});
    } else {
      await unlinkAll(copiedTargetPaths).catch(() => {});
    }
    throw error;
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    let tempRemoved = false;
    try {
      await fs.unlink(item.tempPath);
      tempRemoved = true;
    } catch (error) {
      if (error?.code === 'ENOENT') {
        tempRemoved = true;
      } else {
        console.warn(`[Storage] Không thể xóa temp sau promote ${item.tempKey}:`, error?.message);
      }
    }
    if (tempRemoved) {
      try {
        await clearTempKey(objects[index].id);
      } catch (error) {
        console.warn(`[Storage] Không thể clear temp_key ${item.tempKey}:`, error?.message);
      }
    }
  }
  return objects;
}

/** Backward-compatible single-object wrapper. */
export async function promoteTempStorageObject({
  tempKey,
  tempPath,
  storageKey,
  targetPath,
  category,
  expiresAt = null,
  referenceType = null,
  referenceId = null,
  poolType = STORAGE_POOL_TYPES.WORKSPACE,
  ownerUserId = null,
  actorUserId = null,
  parentMutation = null,
}) {
  const [object] = await promoteTempStorageObjects({
    items: [{ tempKey, tempPath, storageKey, targetPath, category }],
    expiresAt,
    referenceType,
    referenceId,
    poolType,
    ownerUserId,
    actorUserId,
    parentMutation,
  });
  return object;
}
