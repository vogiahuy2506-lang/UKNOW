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
  restoreOrphanedStorageObject,
  updateStorageObjectSize,
} from '../../repositories/storage.repository.js';
import { normalizeStorageKey } from '../../utils/storageKey.util.js';
import {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isStorageKeyReferencedByMessage,
} from './storageReference.service.js';
import { getStorageBackend } from './storageBackend.js';

export const STORAGE_RECONCILE_JOB_CODE = 'storage_objects_reconcile';
const LIVE_STATES = new Set(['active', 'temp', 'cleanup_pending']);
const DEFAULT_UNTRACKED_REPORT_LIMIT = 500;
const DEFAULT_ORPHAN_BRAKE_MIN = 20;
const DEFAULT_ORPHAN_BRAKE_RATIO = 0.1;
const INSPECT_ERROR_SAMPLE_LIMIT = 5;

function isRemoteBackend() {
  const backend = getStorageBackend();
  return Boolean(backend?.isRemote || backend?.type === 'gcs' || backend?.constructor?.name === 'GcsStorageBackend');
}

function positiveInteger(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveRatio(raw, fallback) {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Kiểm một dòng thất bại (mất quyền, mạng, đĩa...) -> KHÔNG kết luận gì về tệp, chỉ ghi nhận để cảnh báo. */
function recordInspectError(metrics, row, error) {
  metrics.inspectErrors += 1;
  if (metrics.inspectErrorSamples.length < INSPECT_ERROR_SAMPLE_LIMIT) {
    metrics.inspectErrorSamples.push({ id: row.id, code: error?.code || error?.name || 'UNKNOWN' });
  }
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
  if (row.storage_key) {
    if (isRemoteBackend()) {
      const exists = await getStorageBackend().exists(row.storage_key);
      if (!exists) return { invalid: false, missing: true, sizeBytes: 0, paths: [] };

      let sizeBytes = Number(row.size_bytes) || 0;
      const metadata = await getStorageBackend().getMetadata(row.storage_key);
      if (metadata && metadata.size !== undefined && metadata.size !== null) {
        sizeBytes = Number(metadata.size);
        const sidecarMetadata = await getStorageBackend().getMetadata(`${row.storage_key}.txt`);
        if (sidecarMetadata && sidecarMetadata.size !== undefined && sidecarMetadata.size !== null) {
          sizeBytes += Number(sidecarMetadata.size);
        }
      }
      return { invalid: false, missing: false, sizeBytes, paths: [] };
    }

    const mainPath = resolvePermanentPath(row.storage_key, roots);
    if (!mainPath) return { invalid: true, missing: false, sizeBytes: 0, paths: [] };

    const mainStat = await statFile(mainPath);
    if (!mainStat) return { invalid: false, missing: true, sizeBytes: 0, paths: [mainPath] };

    let sizeBytes = mainStat.size;
    const paths = [mainPath];
    const sidecarPath = `${mainPath}.txt`;
    const sidecarStat = await statFile(sidecarPath);
    if (sidecarStat) {
      sizeBytes += sidecarStat.size;
      paths.push(sidecarPath);
    }
    return { invalid: false, missing: false, sizeBytes, paths };
  }

  const mainPath = resolveTempPath(row.temp_key, roots);
  if (!mainPath) return { invalid: true, missing: false, sizeBytes: 0, paths: [] };

  const mainStat = await statFile(mainPath);
  if (!mainStat) return { invalid: false, missing: true, sizeBytes: 0, paths: [mainPath] };

  return { invalid: false, missing: false, sizeBytes: mainStat.size, paths: [mainPath] };
}

async function cleanupStorageRow(row, roots) {
  if (row.storage_key) {
    if (isRemoteBackend()) {
      await getStorageBackend().delete([row.storage_key, `${row.storage_key}.txt`]);
    } else {
      const permanent = resolvePermanentPath(row.storage_key, roots);
      if (permanent) {
        await unlinkAll([permanent, `${permanent}.txt`]);
      }
    }
  }
  if (row.temp_key) {
    const temp = resolveTempPath(row.temp_key, roots);
    if (temp) {
      await unlinkAll([temp]);
    }
  }
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

async function reconcileSize(row, roots, metrics) {
  const currentSize = Number(row.size_bytes) || 0;
  let initial;
  try {
    initial = await inspectObject(row, roots);
  } catch (error) {
    recordInspectError(metrics, row, error);
    return null;
  }
  if (initial.invalid || initial.missing || initial.sizeBytes === currentSize) return null;

  return withTransaction(async (client) => {
    if (row.pool_type === 'workspace') {
      await acquireStorageQuotaLock(client, row.owner_user_id);
    }
    const current = await findStorageObjectById(row.id, client, { forUpdate: true });
    if (!current || !LIVE_STATES.has(current.state)) return null;
    if (current.storage_key !== row.storage_key || current.temp_key !== row.temp_key) return null;

    let inspected;
    try {
      inspected = await inspectObject(current, roots);
    } catch (error) {
      recordInspectError(metrics, row, error);
      return null;
    }
    if (inspected.invalid || inspected.missing) return null;
    const previousSize = Number(current.size_bytes) || 0;
    if (inspected.sizeBytes === previousSize) return null;

    await updateStorageObjectSize(current.id, inspected.sizeBytes, client);
    return { before: previousSize, after: inspected.sizeBytes };
  });
}

async function processLedgerRow(row, roots, metrics, now, missingRows) {
  if (row.state === 'orphaned') {
    await healOrphanedRow(row, roots, metrics);
    return;
  }

  if (row.state === 'cleanup_pending') {
    metrics.cleanupRetryScanned += 1;
    try {
      await cleanupStorageRow(row, roots);
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
        return;
      }
    }

    metrics.expiredTempScanned += 1;
    try {
      await cleanupStorageRow(row, roots);
      await markStorageObjectDeleted(row.id);
      metrics.expiredTempDeleted += 1;
      metrics.expiredTempBytes += Number(row.size_bytes) || 0;
    } catch (error) {
      await markStorageObjectCleanupPending(row.id);
      metrics.expiredTempFailed += 1;
    }
    return;
  }

  let inspected;
  try {
    inspected = await inspectObject(row, roots);
  } catch (error) {
    recordInspectError(metrics, row, error);
    return;
  }
  if (inspected.invalid) {
    metrics.invalidKeyRows += 1;
    return;
  }
  if (inspected.missing) {
    // Chưa đánh dấu ngay: gom lại, sau vòng lặp mới quyết định (phanh hàng loạt).
    missingRows.push(row);
    return;
  }

  await applyDrift(row, roots, metrics);
}

async function applyDrift(row, roots, metrics) {
  const drift = await reconcileSize(row, roots, metrics);
  if (drift) {
    metrics.driftCount += 1;
    metrics.driftDeltaBytes += drift.after - drift.before;
  }
}

/**
 * Dòng 'orphaned' còn tệp trên kho -> về 'active' (tự lành sau sự cố quyền/mạng).
 * Vẫn 404 -> giữ nguyên. Lỗi kiểm -> ghi nhận, không đổi gì.
 */
async function healOrphanedRow(row, roots, metrics) {
  let inspected;
  try {
    inspected = await inspectObject(row, roots);
  } catch (error) {
    recordInspectError(metrics, row, error);
    return;
  }
  if (inspected.invalid || inspected.missing) return;
  const restored = await restoreOrphanedStorageObject(row.id);
  if (!restored) return;
  metrics.restoredCount += 1;
  console.warn('[StorageReconcile] Đã khôi phục dòng orphaned vì tệp vẫn còn trên kho', {
    storageObjectId: row.id,
    storageKey: row.storage_key,
  });
  await applyDrift({ ...row, state: 'active' }, roots, metrics);
}

/**
 * Phanh hàng loạt: quá nhiều dòng "mất" cùng lúc gần như chắc chắn là sự cố hạ tầng (đặt sai GCS_BUCKET,
 * khoá trỏ sang project khác -> GCS trả 404 thật cho mọi tệp), không phải người dùng cùng mất tệp.
 */
async function markMissingRows(missingRows, metrics, { processed, brakeMin, brakeRatio }) {
  if (missingRows.length === 0) return;
  const limit = Math.max(brakeMin, Math.ceil(processed * brakeRatio));
  if (missingRows.length > limit) {
    metrics.orphanBrakeTripped = true;
    metrics.orphanCandidates = missingRows.length;
    console.error(
      `[StorageReconcile] PHANH: ${missingRows.length}/${processed} dòng có vẻ mất tệp (ngưỡng ${limit}) `
      + '-> KHÔNG đánh dấu orphaned dòng nào. Kiểm GCS_BUCKET / khoá service account / role IAM.',
      { sampleIds: missingRows.slice(0, 10).map((r) => r.id) }
    );
    return;
  }
  for (const row of missingRows) {
    if (await markMissingObject(row)) {
      metrics.orphanedCount += 1;
      metrics.orphanedBytes += Number(row.size_bytes) || 0;
      console.error('[StorageReconcile] Missing referenced file', {
        storageObjectId: row.id,
        referenceType: row.reference_type || null,
        referenceId: row.reference_id || null,
      });
    }
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
    inspectErrors: 0,
    inspectErrorSamples: [],
    restoredCount: 0,
    orphanBrakeTripped: false,
    orphanCandidates: 0,
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
  orphanBrakeMin = positiveInteger(process.env.STORAGE_RECONCILE_ORPHAN_BRAKE_MIN, DEFAULT_ORPHAN_BRAKE_MIN),
  orphanBrakeRatio = positiveRatio(process.env.STORAGE_RECONCILE_ORPHAN_BRAKE_RATIO, DEFAULT_ORPHAN_BRAKE_RATIO),
  roots: rootOverrides = {},
  now = new Date(),
} = {}) {
  const roots = resolveRoots(rootOverrides);
  const metrics = createMetrics(deleteUntrackedDurable);
  let afterId = 0;
  const missingRows = [];

  while (true) {
    const rows = await listStorageObjectsForReconcile({ afterId, limit: batchSize });
    if (rows.length === 0) break;
    metrics.batches += 1;
    for (const row of rows) {
      await processLedgerRow(row, roots, metrics, now, missingRows);
      metrics.processed += 1;
    }
    afterId = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  await markMissingRows(missingRows, metrics, {
    processed: metrics.processed,
    brakeMin: orphanBrakeMin,
    brakeRatio: orphanBrakeRatio,
  });

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
