#!/usr/bin/env node
/**
 * PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27, PR-T2 — backfill +7h cho dữ liệu email/notification cũ
 * bị PR-T1 (commit 21c1c0b9) để lộ: trước T1, `email_messages.sent_at`/`bounced_at` và
 * `notification_email_logs.sent_at` (timestamp KHÔNG múi giờ trên production) được ghi bằng JS Date
 * qua node-pg trên container UTC, nên lưu giờ UTC thay vì giờ VN. Dấu hiệu: `created_at - col ≈ 7h`
 * (dòng ghi cùng lúc created_at). Script CHỈ sửa ba nhóm này bằng SQL thuần (`col + interval '7 hours'`),
 * không đưa JS Date vào so sánh hay ghi — tránh lặp lại đúng lỗi đang sửa.
 *
 * Idempotent: điều kiện khớp dựa trên dấu hiệu lệch 7h còn tồn tại, nên dòng đã sửa (dấu hiệu mất)
 * không bị chạm lại ở lần chạy sau.
 */
import fs from 'fs';
import db from '../src/config/database.js';

const EPOCH_TOLERANCE_SECONDS = 120; // 2 phút
const SEVEN_HOURS_SECONDS = 7 * 3600;
const SIX_HOURS_SECONDS = 6 * 3600;

const GROUPS = [
  {
    key: 'email_messages.sent_at',
    table: 'email_messages',
    column: 'sent_at',
    // Việc a — dấu hiệu ±2 phút quanh đúng 7h.
    matchWhere: `sent_at IS NOT NULL
       AND abs(extract(epoch FROM (created_at - sent_at)) - ${SEVEN_HOURS_SECONDS}) < ${EPOCH_TOLERANCE_SECONDS}`,
    diffExpr: `extract(epoch FROM (created_at - sent_at))`,
    notNullWhere: 'sent_at IS NOT NULL',
  },
  {
    key: 'email_messages.bounced_at',
    table: 'email_messages',
    column: 'bounced_at',
    // Việc b — khoảng rộng hơn [6h, 7h+2'] theo đúng plan (chỉ 7 dòng, không siết như (a)/(c)).
    matchWhere: `bounced_at IS NOT NULL
       AND (created_at - bounced_at) BETWEEN interval '6 hours' AND interval '7 hours 2 minutes'`,
    diffExpr: `extract(epoch FROM (created_at - bounced_at))`,
    notNullWhere: 'bounced_at IS NOT NULL',
  },
  {
    key: 'notification_email_logs.sent_at',
    table: 'notification_email_logs',
    column: 'sent_at',
    // Việc c — cùng dấu hiệu ±2 phút như (a).
    matchWhere: `sent_at IS NOT NULL
       AND abs(extract(epoch FROM (created_at - sent_at)) - ${SEVEN_HOURS_SECONDS}) < ${EPOCH_TOLERANCE_SECONDS}`,
    diffExpr: `extract(epoch FROM (created_at - sent_at))`,
    notNullWhere: 'sent_at IS NOT NULL',
  },
];

// 6 khoảng của PHẦN KHÔNG KHỚP, tính trên `created_at - col` (giây) — cùng một bộ khoảng cho cả 3
// nhóm (chốt thêm 27/09 chiều). Với (b) (khoảng khớp rộng hơn [6h, 7h+2']), một phần của khoảng
// "6h..(7h-2')" có thể đã nằm trong vùng khớp của (b) — không sao, mỗi khoảng dưới đây LUÔN được
// AND với "KHÔNG khớp" của chính nhóm đó nên không đếm trùng.
const NON_MATCH_BUCKETS = [
  { label: '<-1h', sql: (d) => `${d} < -3600` },
  { label: "-1h..-2'", sql: (d) => `${d} >= -3600 AND ${d} < -${EPOCH_TOLERANCE_SECONDS}` },
  { label: "+-2'", sql: (d) => `${d} >= -${EPOCH_TOLERANCE_SECONDS} AND ${d} <= ${EPOCH_TOLERANCE_SECONDS}` },
  { label: "2'..6h", sql: (d) => `${d} > ${EPOCH_TOLERANCE_SECONDS} AND ${d} < ${SIX_HOURS_SECONDS}` },
  { label: "6h..(7h-2')", sql: (d) => `${d} >= ${SIX_HOURS_SECONDS} AND ${d} <= ${SEVEN_HOURS_SECONDS - EPOCH_TOLERANCE_SECONDS}` },
  { label: ">7h+2'", sql: (d) => `${d} >= ${SEVEN_HOURS_SECONDS + EPOCH_TOLERANCE_SECONDS}` },
];

function csvField(value) {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvLine(fields) {
  return `${fields.map(csvField).join(',')}\n`;
}

function assertBackupPreconditions(apply, backupFile, batchSize) {
  // Review 27/09: batchSize 0 làm vòng lặp lô không bao giờ tiến (lo = hi), NaN làm vòng lặp thoát
  // ngay và báo "tổng đã sửa = 0" như thể xong — cả hai đều phải chặn trước khi đụng DB.
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(`--batch-size phải là số nguyên dương, nhận: ${batchSize}`);
  }
  if (!apply) return;
  // `--backup-file --apply` (quên đường dẫn) sẽ lấy nhầm cờ kế tiếp làm tên file.
  if (!backupFile || backupFile.startsWith('--')) {
    throw new Error("--apply bắt buộc kèm --backup-file <path> (từ chối trước khi đụng DB).");
  }
  if (fs.existsSync(backupFile)) {
    throw new Error(`File backup đã tồn tại, từ chối ghi đè: ${backupFile}`);
  }
}

async function fetchMaxIds(client, tables) {
  const maxIds = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT MAX(id) AS max_id FROM ${table}`);
    maxIds[table] = rows[0].max_id == null ? 0 : Number(rows[0].max_id);
  }
  return maxIds;
}

async function dryRunGroup(client, group, maxId, log) {
  const bucketSelects = NON_MATCH_BUCKETS
    .map((bucket, i) => `COUNT(*) FILTER (WHERE ${group.notNullWhere} AND NOT (${group.matchWhere}) AND ${bucket.sql(group.diffExpr)}) AS b${i}`)
    .join(',\n       ');
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${group.matchWhere}) AS matched,
       ${bucketSelects}
     FROM ${group.table}
     WHERE id <= $1`,
    [maxId]
  );
  const row = rows[0];
  const buckets = {};
  NON_MATCH_BUCKETS.forEach((bucket, i) => {
    buckets[bucket.label] = Number(row[`b${i}`]);
  });
  const matched = Number(row.matched);
  log(`[dry-run] ${group.key}: khớp (sẽ +7h) = ${matched}`);
  log(`[dry-run] ${group.key}: không khớp (khác NULL) theo khoảng created_at - ${group.column}:`);
  for (const bucket of NON_MATCH_BUCKETS) {
    log(`  ${bucket.label}: ${buckets[bucket.label]}`);
  }
  return { key: group.key, matched, buckets };
}

async function applyGroup(client, group, maxId, batchSize, backupFd, log) {
  let lo = 0;
  let updated = 0;
  while (lo < maxId) {
    const hi = Math.min(lo + batchSize, maxId);
    await client.query('BEGIN');
    let rows = [];
    try {
      await client.query("SET LOCAL statement_timeout = '60s'");
      ({ rows } = await client.query(
        `SELECT id, ${group.column}::text AS old_value
           FROM ${group.table}
          WHERE id > $1 AND id <= $2 AND (${group.matchWhere})
          FOR UPDATE`,
        [lo, hi]
      ));
      if (rows.length > 0) {
        const csv = rows.map((r) => csvLine([group.table, r.id, group.column, r.old_value])).join('');
        fs.writeSync(backupFd, csv);
        fs.fsyncSync(backupFd);

        const ids = rows.map((r) => r.id);
        // Lặp lại matchWhere ở UPDATE (không chỉ WHERE id = ANY($1)) dù trong CÙNG transaction với
        // SELECT ... FOR UPDATE ngay trên nên về lý thuyết ids đã chắc chắn còn khớp — đây là lưới an
        // toàn cho lần sửa code sau này (vd tách SELECT/UPDATE ra hai bước), không phải vá một lỗi
        // đang quan sát được. Xem giải thích đầy đủ trong test (đột biến bỏ điều kiện lặp lại).
        await client.query(
          `UPDATE ${group.table}
              SET ${group.column} = ${group.column} + interval '7 hours'
            WHERE id = ANY($1) AND (${group.matchWhere})`,
          [ids]
        );
        updated += rows.length;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
    log(`[apply] ${group.key}: lô (${lo}, ${hi}] — ${rows.length} dòng`);
    lo = hi;
  }
  log(`[apply] ${group.key}: tổng đã sửa = ${updated}`);
  return { key: group.key, updated };
}

async function countNotificationExtraColumns(client, maxId, log) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered_at_count,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened_at_count,
       COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced_at_count
     FROM notification_email_logs
     WHERE id <= $1`,
    [maxId]
  );
  const result = {
    delivered_at: Number(rows[0].delivered_at_count),
    opened_at: Number(rows[0].opened_at_count),
    bounced_at: Number(rows[0].bounced_at_count),
  };
  log(
    `[dry-run] notification_email_logs — chỉ ĐẾM, KHÔNG sửa: delivered_at=${result.delivered_at} `
    + `opened_at=${result.opened_at} bounced_at=${result.bounced_at}`
  );
  return result;
}

/**
 * @param {object} opts
 * @param {boolean} [opts.apply=false] - false = dry-run (mặc định), true = ghi thật.
 * @param {number} [opts.batchSize=5000]
 * @param {string} [opts.backupFile] - bắt buộc khi apply=true.
 * @param {(msg: string) => void} [opts.log=console.log]
 */
export async function runBackfill({ apply = false, batchSize = 5000, backupFile, log = console.log } = {}) {
  assertBackupPreconditions(apply, backupFile, batchSize);

  const client = await db.getClient();
  let backupFd = null;
  try {
    const maxIds = await fetchMaxIds(client, ['email_messages', 'notification_email_logs']);
    log(`Chốt MAX(id): email_messages=${maxIds.email_messages} notification_email_logs=${maxIds.notification_email_logs}`);

    if (apply) {
      backupFd = fs.openSync(backupFile, 'wx');
      fs.writeSync(backupFd, csvLine(['table', 'id', 'column', 'old_value']));
      fs.fsyncSync(backupFd);
    }

    const groups = {};
    for (const group of GROUPS) {
      const maxId = maxIds[group.table];
      if (apply) {
        groups[group.key] = await applyGroup(client, group, maxId, batchSize, backupFd, log);
      } else {
        groups[group.key] = await dryRunGroup(client, group, maxId, log);
      }
    }

    const notificationExtra = apply
      ? null
      : await countNotificationExtraColumns(client, maxIds.notification_email_logs, log);

    return { mode: apply ? 'apply' : 'dry-run', maxIds, groups, notificationExtra };
  } finally {
    if (backupFd != null) fs.closeSync(backupFd);
    client.release();
  }
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const backupFlagIndex = argv.indexOf('--backup-file');
  const backupFile = backupFlagIndex >= 0 ? argv[backupFlagIndex + 1] : undefined;
  const batchSizeFlagIndex = argv.indexOf('--batch-size');
  const batchSize = batchSizeFlagIndex >= 0 ? Number(argv[batchSizeFlagIndex + 1]) : 5000;
  return { apply, backupFile, batchSize };
}

const isMain = process.argv[1] && process.argv[1].endsWith('backfillEmailTimestampsToVn.js');
if (isMain) {
  const { apply, backupFile, batchSize } = parseArgs(process.argv.slice(2));
  runBackfill({ apply, backupFile, batchSize })
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error('[backfill-email-sent-at-vn] failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.pool.end().catch(() => {});
    });
}
