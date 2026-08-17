import { promises as fs } from 'fs';
import path from 'path';
import db from '../../config/database.js';
import {
  acquireStorageQuotaLock,
  activateStorageObject,
  findStorageObjectById,
  listStorageObjectsForReconcile,
  listTrackedStorageKeys,
  markStorageObjectCleanupPending,
  markStorageObjectDeleted,
  markStorageObjectOrphaned,
  updateStorageObjectSize,
} from '../../repositories/storage.repository.js';
import { normalizeStorageKey } from '../../utils/storageKey.util.js';
import {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isStorageKeyReferencedByMessage,
} from './storageReference.service.js';

export const STORAGE_RECONCILE_JOB_CODE = 'storage_objects_reconcile';
const LIVE_STATES = new Set(['active', 'temp', 'cleanup_pending']);
const DEFAULT_UNTRACKED_REPORT_LIMIT = 500;

function positiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlagEnabled(raw) {
  return String(raw || '').trim().toLowerCase() === 'true';
}

function resolveRoots(overrides = {}) {
  return {
    uploads: path.resolve(overrides.uploads || path.resolve(process.cwd(), 'uploads')),
    temp: path.resolve(overrides.temp || path.resolve(process.cwd(), 'temp_uploads')),
  };
}

function resolvePermanentPath(storageKey, roots) {
  const key = normalizeStorageKey(storageKey);
  if (!key) return null;
  const resolved = path.resolve(roots.uploads, key.slice('uploads/'.length));
  return resolved.startsWith(`${roots.uploads}${path.sep}`) ? resolved : null;
}

function resolveTempPath(tempKey, roots) {
  const key = String(tempKey || '').replace(/\\/g, '/');
  if (!key || key.includes('..') || path.posix.isAbsolute(key)) return null;
  const resolved = path.resolve(roots.temp, key);
  return resolved.startsWith(`${roots.temp}${path.sep}`) ? resolved : null;
}

async function statFile(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() ? stats : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function inspectObject(row, roots) {
  const mainPath = row.storage_key
    ? resolvePermanentPath(row.storage_key, roots)
    : resolveTempPath(row.temp_key, roots);
  if (!mainPath) return { invalid: true, missing: false, sizeBytes: 0, paths: [] };

  const mainStat = await statFile(mainPath);
  if (!mainStat) return { invalid: false, missing: true, sizeBytes: 0, paths: [mainPath] };

  let sizeBytes = mainStat.size;
  const paths = [mainPath];
  if (row.storage_key) {
    const sidecarPath = `${mainPath}.txt`;
    const sidecarStat = await statFile(sidecarPath);
    if (sidecarStat) {
      sizeBytes += sidecarStat.size;
      paths.push(sidecarPath);
    }
  }
  return { invalid: false, missing: false, sizeBytes, paths };
}

function cleanupPaths(row, roots) {
  const paths = [];
  const permanent = resolvePermanentPath(row.storage_key, roots);
  if (permanent) paths.push(permanent, `${permanent}.txt`);
  const temp = resolveTempPath(row.temp_key, roots);
  if (temp) paths.push(temp);
  return paths;
}

async function unlinkAll(paths) {
  for (const filePath of paths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function withTransaction(work) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function markMissingObject(row) {
  return withTransaction(async (client) => {
    const current = await findStorageObjectById(row.id, client, { forUpdate: true });
    if (!current || !LIVE_STATES.has(current.state)) return false;
    if (current.storage_key !== row.storage_key || current.temp_key !== row.temp_key) return false;
    await markStorageObjectOrphaned(current.id, client);
    return true;
  });
}

async function reconcileSize(row, roots) {
  const currentSize = Number(row.size_bytes) || 0;
  const initial = await inspectObject(row, roots);
  if (initial.invalid || initial.missing || initial.sizeBytes === currentSize) return null;

  return withTransaction(async (client) => {
    if (row.pool_type === 'workspace') {
      await acquireStorageQuotaLock(client, row.owner_user_id);
    }
    const current = await findStorageObjectById(row.id, client, { forUpdate: true });
    if (!current || !LIVE_STATES.has(current.state)) return null;
    if (current.storage_key !== row.storage_key || current.temp_key !== row.temp_key) return null;

    const inspected = await inspectObject(current, roots);
    if (inspected.invalid || inspected.missing) return null;
    const previousSize = Number(current.size_bytes) || 0;
    if (inspected.sizeBytes === previousSize) return null;

    await updateStorageObjectSize(current.id, inspected.sizeBytes, client);
    return { before: previousSize, after: inspected.sizeBytes };
  });
}

async function processLedgerRow(row, roots, metrics, now) {
  if (row.state === 'cleanup_pending') {
    metrics.cleanupRetryScanned += 1;
    try {
      await unlinkAll(cleanupPaths(row, roots));
      await markStorageObjectDeleted(row.id);
      metrics.cleanupRetryDeleted += 1;
      metrics.cleanupRetryBytes += Number(row.size_bytes) || 0;
    } catch (error) {
      metrics.cleanupRetryFailed += 1;
    }
    return;
  }

  const expiredTemp = row.state === 'temp'
    && row.expires_at
    && new Date(row.expires_at).getTime() <= now.getTime();
  if (expiredTemp) {
    if (row.storage_key) {
      try {
        const isReferenced = await isStorageKeyReferencedByMessage(row.storage_key);
        if (isReferenced) {
          console.warn(`[StorageReconcile] CẢNH BÁO: Tệp temp quá hạn (${row.storage_key}, id=${row.id}) đang được tin nhắn tham chiếu! Có thể promote bị sót. Đang tự động promote lên active thay vì xóa.`);
          await activateStorageObject({
            id: row.id,
            storageKey: row.storage_key,
            expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          });
          return;
        }
      } catch (err) {
        console.warn(`[StorageReconcile] Failed to check message reference for ${row.storage_key}:`, err.message);
      }
    }

    metrics.expiredTempScanned += 1;
    try {
      await unlinkAll(cleanupPaths(row, roots));
      await markStorageObjectDeleted(row.id);
      metrics.expiredTempDeleted += 1;
      metrics.expiredTempBytes += Number(row.size_bytes) || 0;
    } catch (error) {
      await markStorageObjectCleanupPending(row.id);
      metrics.expiredTempFailed += 1;
    }
    return;
  }

  const inspected = await inspectObject(row, roots);
  if (inspected.invalid) {
    metrics.invalidKeyRows += 1;
    return;
  }
  if (inspected.missing) {
    if (await markMissingObject(row)) {
      metrics.orphanedCount += 1;
      metrics.orphanedBytes += Number(row.size_bytes) || 0;
      console.error('[StorageReconcile] Missing referenced file', {
        storageObjectId: row.id,
        referenceType: row.reference_type || null,
        referenceId: row.reference_id || null,
      });
    }
    return;
  }

  const drift = await reconcileSize(row, roots);
  if (drift) {
    metrics.driftCount += 1;
    metrics.driftDeltaBytes += drift.after - drift.before;
  }
}

async function walkFiles(root, prefix = '') {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, relative));
    else if (entry.isFile()) files.push({ relative, absolute });
  }
  return files;
}

function addDurableDeleteCandidate(metrics, candidate, physicalBytes, stats, reportLimit) {
  metrics.untrackedDurableDeleteCandidateCount += 1;
  metrics.untrackedDurableDeleteCandidateBytes += physicalBytes;
  if (metrics.untrackedDurableDeleteCandidates.length < reportLimit) {
    metrics.untrackedDurableDeleteCandidates.push({
      storageKey: candidate.storageKey,
      sizeBytes: physicalBytes,
      modifiedAt: stats.mtime.toISOString(),
    });
  } else {
    metrics.untrackedDurableDeleteCandidatesTruncated = true;
  }
}

async function reconcileUntrackedFiles({
  roots,
  referenceIndex,
  graceMs,
  metrics,
  now,
  deleteUntrackedDurable,
  reportLimit,
}) {
  const trackedRows = await listTrackedStorageKeys();
  const trackedPermanent = new Set(trackedRows.map((row) => row.storage_key).filter(Boolean));
  const trackedTemp = new Set(trackedRows.map((row) => row.temp_key).filter(Boolean));
  const [uploads, temps] = await Promise.all([
    walkFiles(roots.uploads),
    walkFiles(roots.temp),
  ]);
  const uploadNames = new Set(uploads.map((entry) => entry.relative));

  const candidates = [];
  for (const entry of uploads) {
    if (entry.relative.endsWith('.txt') && uploadNames.has(entry.relative.slice(0, -4))) continue;
    const storageKey = `uploads/${entry.relative}`;
    if (!trackedPermanent.has(storageKey)) candidates.push({ ...entry, storageKey, durable: true });
  }
  for (const entry of temps) {
    if (!trackedTemp.has(entry.relative)) candidates.push({ ...entry, tempKey: entry.relative, durable: false });
  }

  for (const candidate of candidates) {
    const stats = await statFile(candidate.absolute);
    if (!stats) continue;
    let physicalBytes = stats.size;
    if (candidate.durable) {
      const sidecar = await statFile(`${candidate.absolute}.txt`);
      if (sidecar) physicalBytes += sidecar.size;
    }

    metrics.untrackedCount += 1;
    metrics.untrackedBytes += physicalBytes;
    const olderThanGrace = now.getTime() - stats.mtimeMs >= graceMs;
    if (!olderThanGrace) {
      metrics.untrackedRetainedCount += 1;
      metrics.untrackedRetainedBytes += physicalBytes;
      if (candidate.durable) metrics.untrackedDurableBytes += physicalBytes;
      continue;
    }

    let referenced = false;
    if (candidate.durable) {
      referenced = getIndexedStorageReferences(referenceIndex, candidate.storageKey).length > 0;
      if (!referenced) {
        referenced = await isStorageKeyReferencedByMessage(candidate.storageKey);
      }
    }
    if (referenced) {
      metrics.untrackedReferencedCount += 1;
      metrics.untrackedRetainedCount += 1;
      metrics.untrackedRetainedBytes += physicalBytes;
      if (candidate.durable) metrics.untrackedDurableBytes += physicalBytes;
      continue;
    }

    if (candidate.durable) {
      addDurableDeleteCandidate(metrics, candidate, physicalBytes, stats, reportLimit);
      if (!deleteUntrackedDurable) {
        metrics.untrackedRetainedCount += 1;
        metrics.untrackedRetainedBytes += physicalBytes;
        metrics.untrackedDurableBytes += physicalBytes;
        continue;
      }
    }

    try {
      await unlinkAll(candidate.durable
        ? [candidate.absolute, `${candidate.absolute}.txt`]
        : [candidate.absolute]);
      metrics.untrackedDeletedCount += 1;
      metrics.untrackedDeletedBytes += physicalBytes;
    } catch (error) {
      metrics.untrackedDeleteFailed += 1;
      metrics.untrackedRetainedCount += 1;
      metrics.untrackedRetainedBytes += physicalBytes;
      if (candidate.durable) metrics.untrackedDurableBytes += physicalBytes;
    }
  }
}

function createMetrics(deleteUntrackedDurable) {
  return {
    processed: 0,
    batches: 0,
    orphanedCount: 0,
    orphanedBytes: 0,
    driftCount: 0,
    driftDeltaBytes: 0,
    cleanupRetryScanned: 0,
    cleanupRetryDeleted: 0,
    cleanupRetryFailed: 0,
    cleanupRetryBytes: 0,
    expiredTempScanned: 0,
    expiredTempDeleted: 0,
    expiredTempFailed: 0,
    expiredTempBytes: 0,
    invalidKeyRows: 0,
    untrackedCount: 0,
    untrackedBytes: 0,
    untrackedRetainedCount: 0,
    untrackedRetainedBytes: 0,
    untrackedReferencedCount: 0,
    untrackedDeletedCount: 0,
    untrackedDeletedBytes: 0,
    untrackedDeleteFailed: 0,
    untrackedDurableBytes: 0,
    untrackedDurableDeleteEnabled: deleteUntrackedDurable,
    untrackedDurableDeleteCandidateCount: 0,
    untrackedDurableDeleteCandidateBytes: 0,
    untrackedDurableDeleteCandidates: [],
    untrackedDurableDeleteCandidatesTruncated: false,
  };
}

/** Nightly, batch-oriented ledger/filesystem reconciliation. */
export async function reconcileStorageObjects({
  batchSize = positiveInteger(process.env.STORAGE_RECONCILE_BATCH_SIZE, 200),
  orphanGraceHours = positiveInteger(process.env.STORAGE_ORPHAN_GRACE_HOURS, 24),
  deleteUntrackedDurable = envFlagEnabled(process.env.STORAGE_RECONCILE_DELETE_UNTRACKED),
  untrackedReportLimit = positiveInteger(
    process.env.STORAGE_RECONCILE_UNTRACKED_REPORT_LIMIT,
    DEFAULT_UNTRACKED_REPORT_LIMIT
  ),
  roots: rootOverrides = {},
  now = new Date(),
} = {}) {
  const roots = resolveRoots(rootOverrides);
  const metrics = createMetrics(deleteUntrackedDurable);
  let afterId = 0;

  while (true) {
    const rows = await listStorageObjectsForReconcile({ afterId, limit: batchSize });
    if (rows.length === 0) break;
    metrics.batches += 1;
    for (const row of rows) {
      await processLedgerRow(row, roots, metrics, now);
      metrics.processed += 1;
    }
    afterId = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  const referenceIndex = await buildStorageReferenceIndex();
  await reconcileUntrackedFiles({
    roots,
    referenceIndex,
    graceMs: orphanGraceHours * 60 * 60 * 1000,
    metrics,
    now,
    deleteUntrackedDurable,
    reportLimit: untrackedReportLimit,
  });

  return metrics;
}

export default { reconcileStorageObjects };
