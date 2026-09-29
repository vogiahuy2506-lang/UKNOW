import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Sao lưu DB ra GCS (PR-S1, PLAN_ON_DINH_SAO_LUU_CANH_BAO_ZALO_2026-09-29).
 * Logic thuần (retention, kiểm size, tuổi bản mới nhất) tách riêng để unit test không cần GCS thật.
 */

export const DB_BACKUP_PREFIX = 'db-backups/';
export const DEFAULT_KEEP_DAYS = 30;
/** Không bao giờ để số bản còn lại dưới ngưỡng này (phòng đồng hồ sai / bản mới lỗi). */
export const MIN_BACKUPS_TO_KEEP = 3;
export const DAY_MS = 24 * 60 * 60 * 1000;

const SAFE_FILE_NAME = /^[A-Za-z0-9._-]+$/;

export function isSafeBackupFileName(name) {
  const text = String(name || '');
  return SAFE_FILE_NAME.test(text) && !text.includes('..') && text.length <= 200;
}

/** @returns {number} epoch ms, hoặc NaN */
function timeCreatedMs(file) {
  return new Date(file?.metadata?.timeCreated || file?.timeCreated || '').getTime();
}

/**
 * Chọn các bản cần xoá.
 * @param {Array<{name:string, metadata?:{timeCreated?:string}}>} files toàn bộ bản trong db-backups/ (gồm cả bản vừa tải)
 * @param {{ keepDays?: number, now?: number, justUploaded?: string, minKeep?: number }} opts
 * @returns {string[]} tên object cần xoá (cũ nhất trước)
 */
export function planRetentionDeletes(files, {
  keepDays = DEFAULT_KEEP_DAYS,
  now = Date.now(),
  justUploaded = '',
  minKeep = MIN_BACKUPS_TO_KEEP,
} = {}) {
  const list = Array.isArray(files) ? files : [];
  const cutoff = now - keepDays * DAY_MS;
  const expired = list
    .filter((f) => f.name !== justUploaded)
    .map((f) => ({ name: f.name, ms: timeCreatedMs(f) }))
    .filter((f) => Number.isFinite(f.ms) && f.ms < cutoff)
    .sort((a, b) => a.ms - b.ms);
  const maxDelete = Math.max(0, list.length - minKeep);
  return expired.slice(0, maxDelete).map((f) => f.name);
}

/** Kích thước object trên GCS phải đúng bằng số byte đã nhận từ STDIN (và > 0). */
export function isUploadSizeValid(objectSize, receivedBytes) {
  const size = Number(objectSize);
  return Number.isFinite(size) && receivedBytes > 0 && size === receivedBytes;
}

/**
 * Đánh giá tuổi bản mới nhất.
 * @returns {{ stale: boolean, count: number, ageHours: number|null, latestAt: string|null }}
 */
export function evaluateBackupFreshness(files, { maxAgeHours = 30, now = Date.now() } = {}) {
  const times = (Array.isArray(files) ? files : [])
    .map(timeCreatedMs)
    .filter((ms) => Number.isFinite(ms));
  if (!times.length) return { stale: true, count: 0, ageHours: null, latestAt: null };
  const latest = Math.max(...times);
  const ageHours = (now - latest) / (60 * 60 * 1000);
  return {
    stale: ageHours > maxAgeHours,
    count: times.length,
    ageHours,
    latestAt: new Date(latest).toISOString(),
  };
}

export async function listDbBackups(bucket) {
  const [files] = await bucket.getFiles({ prefix: DB_BACKUP_PREFIX });
  return (files || []).filter((f) => f.name && f.name !== DB_BACKUP_PREFIX);
}

/**
 * Tải STDIN lên `db-backups/<fileName>`, kiểm size, dọn bản quá hạn.
 * Ném lỗi khi thất bại (size lệch → đã xoá object vừa ghi).
 */
export async function uploadDbBackup({ bucket, fileName, input, keepDays = DEFAULT_KEEP_DAYS, now = Date.now() }) {
  if (!isSafeBackupFileName(fileName)) throw new Error('Ten file sao luu khong hop le');
  const key = `${DB_BACKUP_PREFIX}${fileName}`;
  const file = bucket.file(key);

  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      cb(null, chunk);
    },
  });

  try {
    await pipeline(
      input,
      counter,
      file.createWriteStream({
        resumable: true,
        contentType: 'application/octet-stream',
        metadata: { metadata: { source: 'backup-db.sh' } },
      }),
    );
  } catch (err) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw err;
  }

  const [meta] = await file.getMetadata();
  if (!isUploadSizeValid(meta?.size, bytes)) {
    await file.delete({ ignoreNotFound: true }).catch(() => {});
    throw new Error(`Size object (${meta?.size}) lech so byte nhan tu STDIN (${bytes})`);
  }

  const all = await listDbBackups(bucket);
  const toDelete = planRetentionDeletes(all, { keepDays, now, justUploaded: key });
  for (const name of toDelete) {
    await bucket.file(name).delete({ ignoreNotFound: true });
  }

  return { name: fileName, bytes, remaining: all.length - toDelete.length, deleted: toDelete.length };
}

/** Lấy thông tin độ mới của sao lưu trên GCS (cho luật cảnh báo). */
export async function getDbBackupFreshness(bucket, opts = {}) {
  const files = await listDbBackups(bucket);
  return evaluateBackupFreshness(files, opts);
}

/**
 * Lõi CLI: trả mã thoát. Không in tên bucket/khoá.
 * @param {{ argv: string[], stdin: NodeJS.ReadableStream, bucket: object, log?: Function, err?: Function, now?: number }} deps
 */
export async function runDbBackupUploadCli({ argv, stdin, bucket, log = console.log, err = console.error, now = Date.now() }) {
  const fileName = argv.find((a) => !a.startsWith('--'));
  const keepArg = argv.find((a) => a.startsWith('--keep-days='));
  const keepDays = keepArg ? Number(keepArg.split('=')[1]) : DEFAULT_KEEP_DAYS;
  if (!fileName || !Number.isFinite(keepDays) || keepDays < 1) {
    err('Cach dung: uploadDbBackupToGcs.mjs <tenFile> [--keep-days=30] < dump');
    return 2;
  }
  try {
    const result = await uploadDbBackup({ bucket, fileName, input: stdin, keepDays, now });
    log(JSON.stringify({ ok: true, ...result }));
    return 0;
  } catch (e) {
    err(JSON.stringify({ ok: false, error: e.message }));
    return 1;
  }
}
