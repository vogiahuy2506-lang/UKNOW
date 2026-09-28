#!/usr/bin/env node
/**
 * PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27, PR-T3 Việc 5 — backfill +7h cho các cột "ăn theo" thời
 * điểm gửi email mà Việc 1 (PR-T3) vừa sửa đường ghi mới, nhưng dữ liệu CŨ (ghi trước khi Việc 1
 * deploy) vẫn còn mang giờ UTC bị gắn nhầm thành TIMESTAMP không múi giờ:
 *   (a) customer_journey.event_at (event_type='email_sent') — so created_at cùng dòng.
 *   (b) customers.last_email_sent_at — so MAX(email_messages.created_at) theo id_customer (mọi
 *       status kể cả failed/bounced — đường lỗi cũng ghi email_messages).
 *   (c) campaign_customers.first_email_sent_at (so MIN) / last_email_sent_at (so MAX) theo
 *       (id_campaign, id_customer); last_activity_at CHỈ +7h khi giá trị CŨ của nó bằng giá trị CŨ
 *       của last_email_sent_at (lần ghi cuối là lần GỬI, ghi UTC) — nếu lần ghi cuối là mở/nhấp (ghi
 *       giờ VN qua customerEmailTracking.repository.js) thì last_activity_at KHÔNG bị chạm, vì nó
 *       đã đúng và đứng SAU last_email_sent_at trên dòng thời gian thật.
 *   (d) (CHỈ khi --delete-failed-journey) xoá customer_journey 'email_sent' trỏ tới email_messages
 *       đã failed/bounced — nhánh này KHÔNG nằm trong duyệt (a)-(c), cần OK riêng của user.
 *
 * Dấu hiệu nhận diện dòng cần sửa: lệch đúng 7h (±2 phút) so với mốc tham chiếu — script CHỈ sửa
 * SQL thuần (`col + interval '7 hours'`), không đưa JS Date vào so sánh hay ghi, tránh lặp lại
 * đúng lỗi đang sửa (cùng nguyên tắc PR-T2).
 *
 * Idempotent: điều kiện khớp dựa trên dấu hiệu lệch 7h còn tồn tại nên dòng đã sửa (dấu hiệu mất)
 * không bị chạm lại ở lần chạy sau — CHẠY LẠI phải ra 0 cho (a)(b)(c).
 *
 * Chỉ chạy SAU khi Việc 1-4 đã deploy (không còn dòng UTC mới sinh ra trong lúc backfill).
 */
import fs from 'fs';
import db from '../src/config/database.js';

const EPOCH_TOLERANCE_SECONDS = 120; // 2 phút
const SEVEN_HOURS_SECONDS = 7 * 3600;
const SIX_HOURS_SECONDS = 6 * 3600;

// Cùng 6 khoảng của T2 (backfillEmailTimestampsToVn.js) — một bộ khoảng thống nhất cho mọi nhóm.
const NON_MATCH_BUCKETS = [
  { label: '<-1h', sql: (d) => `${d} < -3600` },
  { label: "-1h..-2'", sql: (d) => `${d} >= -3600 AND ${d} < -${EPOCH_TOLERANCE_SECONDS}` },
  { label: "+-2'", sql: (d) => `${d} >= -${EPOCH_TOLERANCE_SECONDS} AND ${d} <= ${EPOCH_TOLERANCE_SECONDS}` },
  { label: "2'..6h", sql: (d) => `${d} > ${EPOCH_TOLERANCE_SECONDS} AND ${d} < ${SIX_HOURS_SECONDS}` },
  { label: "6h..(7h-2')", sql: (d) => `${d} >= ${SIX_HOURS_SECONDS} AND ${d} <= ${SEVEN_HOURS_SECONDS - EPOCH_TOLERANCE_SECONDS}` },
  { label: ">7h+2'", sql: (d) => `${d} >= ${SEVEN_HOURS_SECONDS + EPOCH_TOLERANCE_SECONDS}` },
];

// ─── Nhóm (a)/(b): đơn giản, 1 cột tự so lệch — dùng chung khuôn generic của T2 ─────────────────

const GROUP_A_JOURNEY = {
  key: 'customer_journey.event_at',
  table: 'customer_journey',
  column: 'event_at',
  notNullWhere: `event_type = 'email_sent' AND event_at IS NOT NULL`,
  // created_at là TIMESTAMPTZ (không đổi ở Việc 4), event_at là TIMESTAMP (đổi ở Việc 4) — ép
  // created_at về ::timestamp theo TZ phiên (Asia/Ho_Chi_Minh, xem database.js) để lấy đúng hiệu số
  // giờ tường (wall-clock), cùng cách T2 so hai cột TIMESTAMP với nhau.
  matchWhere: `event_type = 'email_sent' AND event_at IS NOT NULL
     AND abs(extract(epoch FROM (created_at::timestamp - event_at)) - ${SEVEN_HOURS_SECONDS}) <= ${EPOCH_TOLERANCE_SECONDS}`,
  diffExpr: `extract(epoch FROM (created_at::timestamp - event_at))`,
};

const GROUP_B_CUSTOMER = {
  key: 'customers.last_email_sent_at',
  table: 'customers',
  column: 'last_email_sent_at',
  // So MAX(email_messages.created_at) theo id_customer — MỌI status (đường lỗi cũng insertEmailMessage,
  // xem PR-T3 Việc 2), chỉ loại preview.
  notNullWhere: `last_email_sent_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM email_messages em WHERE em.id_customer = customers.id AND NOT em.is_preview)`,
  matchWhere: `last_email_sent_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM email_messages em WHERE em.id_customer = customers.id AND NOT em.is_preview)
     AND abs(extract(epoch FROM (
       (SELECT MAX(em.created_at) FROM email_messages em WHERE em.id_customer = customers.id AND NOT em.is_preview)
       - last_email_sent_at
     )) - ${SEVEN_HOURS_SECONDS}) <= ${EPOCH_TOLERANCE_SECONDS}`,
  diffExpr: `extract(epoch FROM (
     (SELECT MAX(em.created_at) FROM email_messages em WHERE em.id_customer = customers.id AND NOT em.is_preview)
     - last_email_sent_at
  ))`,
};

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
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(`--batch-size phải là số nguyên dương, nhận: ${batchSize}`);
  }
  if (!apply) return;
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
  log(`[dry-run] ${group.key}: không khớp (khác NULL) theo khoảng lệch:`);
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
      await client.query("SET LOCAL statement_timeout = '30s'");
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
        // Lặp lại matchWhere ở UPDATE (lưới an toàn cho lần sửa code sau — xem giải thích đầy đủ ở
        // T2/backfillEmailTimestampsToVn.js).
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

// ─── Nhóm (c): campaign_customers — 2 cột so MIN/MAX của bảng khác + last_activity_at có điều
// kiện, không có cột `id` đơn (khoá tự nhiên là (id_campaign, id_customer)) nên KHÔNG dùng khuôn
// generic ở trên. Áp dụng lại: chọn LIMIT batchSize dòng còn khớp mỗi lượt, dòng đã sửa tự rơi khỏi
// tập khớp (matchWhere) ở lượt sau — không cần chốt "id <= max" vì không có id để chốt; dòng mới
// sinh ra sau khi Việc 1 deploy vốn đã đúng giờ VN nên không bao giờ khớp matchWhere. ────────────

const CC_FIRST_REF = `(SELECT MIN(em.created_at) FROM email_messages em WHERE em.id_customer = cc.id_customer AND em.id_campaign = cc.id_campaign AND NOT em.is_preview)`;
const CC_LAST_REF = `(SELECT MAX(em.created_at) FROM email_messages em WHERE em.id_customer = cc.id_customer AND em.id_campaign = cc.id_campaign AND NOT em.is_preview)`;
const CC_FIRST_MATCHES = `(cc.first_email_sent_at IS NOT NULL AND ${CC_FIRST_REF} IS NOT NULL
   AND abs(extract(epoch FROM (${CC_FIRST_REF} - cc.first_email_sent_at)) - ${SEVEN_HOURS_SECONDS}) <= ${EPOCH_TOLERANCE_SECONDS})`;
const CC_LAST_MATCHES = `(cc.last_email_sent_at IS NOT NULL AND ${CC_LAST_REF} IS NOT NULL
   AND abs(extract(epoch FROM (${CC_LAST_REF} - cc.last_email_sent_at)) - ${SEVEN_HOURS_SECONDS}) <= ${EPOCH_TOLERANCE_SECONDS})`;
const CC_FIRST_DIFF = `extract(epoch FROM (${CC_FIRST_REF} - cc.first_email_sent_at))`;
const CC_LAST_DIFF = `extract(epoch FROM (${CC_LAST_REF} - cc.last_email_sent_at))`;

async function dryRunGroupC(client, log) {
  const bucketSelectsFirst = NON_MATCH_BUCKETS
    .map((bucket, i) => `COUNT(*) FILTER (WHERE cc.first_email_sent_at IS NOT NULL AND ${CC_FIRST_REF} IS NOT NULL AND NOT (${CC_FIRST_MATCHES}) AND ${bucket.sql(CC_FIRST_DIFF)}) AS fb${i}`)
    .join(',\n       ');
  const bucketSelectsLast = NON_MATCH_BUCKETS
    .map((bucket, i) => `COUNT(*) FILTER (WHERE cc.last_email_sent_at IS NOT NULL AND ${CC_LAST_REF} IS NOT NULL AND NOT (${CC_LAST_MATCHES}) AND ${bucket.sql(CC_LAST_DIFF)}) AS lb${i}`)
    .join(',\n       ');
  const { rows } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE ${CC_FIRST_MATCHES}) AS first_matched,
       COUNT(*) FILTER (WHERE ${CC_LAST_MATCHES}) AS last_matched,
       COUNT(*) FILTER (WHERE ${CC_FIRST_MATCHES} OR ${CC_LAST_MATCHES}) AS matched,
       ${bucketSelectsFirst},
       ${bucketSelectsLast}
     FROM campaign_customers cc`
  );
  const row = rows[0];
  const firstBuckets = {};
  const lastBuckets = {};
  NON_MATCH_BUCKETS.forEach((bucket, i) => {
    firstBuckets[bucket.label] = Number(row[`fb${i}`]);
    lastBuckets[bucket.label] = Number(row[`lb${i}`]);
  });
  const matched = Number(row.matched);
  const firstMatched = Number(row.first_matched);
  const lastMatched = Number(row.last_matched);
  log(`[dry-run] campaign_customers.first/last_email_sent_at: khớp (dòng có ÍT NHẤT 1 cột sẽ +7h) = ${matched}`
    + ` (first=${firstMatched}, last=${lastMatched})`);
  log(`[dry-run] campaign_customers.first_email_sent_at: không khớp theo khoảng lệch:`);
  for (const bucket of NON_MATCH_BUCKETS) log(`  ${bucket.label}: ${firstBuckets[bucket.label]}`);
  log(`[dry-run] campaign_customers.last_email_sent_at: không khớp theo khoảng lệch:`);
  for (const bucket of NON_MATCH_BUCKETS) log(`  ${bucket.label}: ${lastBuckets[bucket.label]}`);
  return { key: 'campaign_customers.first_last_email_sent_at', matched, firstMatched, lastMatched, firstBuckets, lastBuckets };
}

async function applyGroupC(client, batchSize, backupFd, log) {
  let updated = 0;
  let lastActivityUpdated = 0;
  for (;;) {
    await client.query('BEGIN');
    let rows = [];
    try {
      await client.query("SET LOCAL statement_timeout = '30s'");
      ({ rows } = await client.query(
        `SELECT cc.id_campaign, cc.id_customer,
                cc.first_email_sent_at::text AS first_email_sent_at,
                cc.last_email_sent_at::text AS last_email_sent_at,
                cc.last_activity_at::text AS last_activity_at,
                ${CC_FIRST_MATCHES} AS first_matches,
                ${CC_LAST_MATCHES} AS last_matches
           FROM campaign_customers cc
          WHERE ${CC_FIRST_MATCHES} OR ${CC_LAST_MATCHES}
          LIMIT $1
          FOR UPDATE OF cc`,
        [batchSize]
      ));
      if (rows.length > 0) {
        const csvLines = [];
        for (const r of rows) {
          const naturalId = `${r.id_campaign}:${r.id_customer}`;
          if (r.first_matches) csvLines.push(csvLine(['campaign_customers', naturalId, 'first_email_sent_at', r.first_email_sent_at]));
          if (r.last_matches) csvLines.push(csvLine(['campaign_customers', naturalId, 'last_email_sent_at', r.last_email_sent_at]));
          // last_activity_at CHỈ +7h khi giá trị CŨ của nó bằng giá trị CŨ của last_email_sent_at
          // (lần ghi cuối là lần GỬI — ghi UTC qua ESR upsertCampaignCustomer). Khác nhau nghĩa là
          // mở/nhấp (ghi giờ VN) đã ghi ĐÈ sau đó — giữ nguyên, KHÔNG được +7h (mới là đúng).
          if (r.last_matches && r.last_activity_at === r.last_email_sent_at) {
            csvLines.push(csvLine(['campaign_customers', naturalId, 'last_activity_at', r.last_activity_at]));
            lastActivityUpdated += 1;
          }
        }
        fs.writeSync(backupFd, csvLines.join(''));
        fs.fsyncSync(backupFd);

        const values = [];
        const params = [];
        rows.forEach((r, i) => {
          params.push(r.id_campaign, r.id_customer);
          values.push(`($${i * 2 + 1}::bigint, $${i * 2 + 2}::bigint)`);
        });
        await client.query(
          `UPDATE campaign_customers cc
              SET first_email_sent_at = CASE WHEN ${CC_FIRST_MATCHES} THEN cc.first_email_sent_at + interval '7 hours' ELSE cc.first_email_sent_at END,
                  last_email_sent_at  = CASE WHEN ${CC_LAST_MATCHES}  THEN cc.last_email_sent_at  + interval '7 hours' ELSE cc.last_email_sent_at END,
                  last_activity_at    = CASE WHEN ${CC_LAST_MATCHES} AND cc.last_activity_at = cc.last_email_sent_at
                                              THEN cc.last_activity_at + interval '7 hours'
                                              ELSE cc.last_activity_at END
             FROM (VALUES ${values.join(', ')}) AS v(id_campaign, id_customer)
            WHERE cc.id_campaign = v.id_campaign AND cc.id_customer = v.id_customer
              AND (${CC_FIRST_MATCHES} OR ${CC_LAST_MATCHES})`,
          params
        );
        updated += rows.length;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
    log(`[apply] campaign_customers.first_last_email_sent_at: lô — ${rows.length} dòng`);
    if (rows.length === 0) break;
    if (rows.length < batchSize) break; // lô cuối chưa đầy — không còn dòng nào khớp nữa
  }
  log(`[apply] campaign_customers.first_last_email_sent_at: tổng đã sửa = ${updated} (last_activity_at trong đó = ${lastActivityUpdated})`);
  return { key: 'campaign_customers.first_last_email_sent_at', updated, lastActivityUpdated };
}

// ─── Nhóm (d): xoá customer_journey email_sent trỏ tới thư failed/bounced — CHỈ khi có cờ ────────

const FAILED_JOURNEY_MATCH = `cj.event_type = 'email_sent'
   AND cj.id_email_message IS NOT NULL
   AND EXISTS (SELECT 1 FROM email_messages em WHERE em.id = cj.id_email_message AND em.status IN ('failed', 'bounced'))`;

async function dryRunDeleteFailedJourney(client, maxId, log) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM customer_journey cj WHERE id <= $1 AND ${FAILED_JOURNEY_MATCH}`,
    [maxId]
  );
  const count = Number(rows[0].n);
  log(`[dry-run] (d) customer_journey email_sent trỏ tới thư failed/bounced (sẽ XOÁ nếu bật --delete-failed-journey) = ${count}`);
  return { candidateCount: count };
}

async function applyDeleteFailedJourney(client, maxId, batchSize, backupFd, log) {
  let lo = 0;
  let deleted = 0;
  while (lo < maxId) {
    const hi = Math.min(lo + batchSize, maxId);
    await client.query('BEGIN');
    let rows = [];
    try {
      await client.query("SET LOCAL statement_timeout = '30s'");
      ({ rows } = await client.query(
        `SELECT cj.* FROM customer_journey cj
          WHERE cj.id > $1 AND cj.id <= $2 AND ${FAILED_JOURNEY_MATCH}
          FOR UPDATE OF cj`,
        [lo, hi]
      ));
      if (rows.length > 0) {
        const csv = rows.map((r) => csvLine(['customer_journey', r.id, '__deleted_row__', JSON.stringify(r)])).join('');
        fs.writeSync(backupFd, csv);
        fs.fsyncSync(backupFd);

        const ids = rows.map((r) => r.id);
        await client.query(
          `DELETE FROM customer_journey AS cj WHERE cj.id = ANY($1) AND ${FAILED_JOURNEY_MATCH}`,
          [ids]
        );
        deleted += rows.length;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
    log(`[apply] (d) xoá customer_journey: lô (${lo}, ${hi}] — ${rows.length} dòng`);
    lo = hi;
  }
  log(`[apply] (d) xoá customer_journey: tổng đã xoá = ${deleted}`);
  return { deletedCount: deleted };
}

/**
 * @param {object} opts
 * @param {boolean} [opts.apply=false] - false = dry-run (mặc định), true = ghi thật.
 * @param {number} [opts.batchSize=2000]
 * @param {string} [opts.backupFile] - bắt buộc khi apply=true.
 * @param {(msg: string) => void} [opts.log=console.log]
 * @param {boolean} [opts.deleteFailedJourney=false] - (d), cần OK riêng, KHÔNG nằm trong duyệt (a)-(c).
 */
export async function runBackfill({
  apply = false,
  batchSize = 2000,
  backupFile,
  log = console.log,
  deleteFailedJourney = false,
} = {}) {
  assertBackupPreconditions(apply, backupFile, batchSize);

  const client = await db.getClient();
  let backupFd = null;
  try {
    const maxIds = await fetchMaxIds(client, ['customer_journey', 'customers']);
    log(`Chốt MAX(id): customer_journey=${maxIds.customer_journey} customers=${maxIds.customers}`);

    if (apply) {
      backupFd = fs.openSync(backupFile, 'wx');
      fs.writeSync(backupFd, csvLine(['table', 'id', 'column', 'old_value']));
      fs.fsyncSync(backupFd);
    }

    const groups = {};
    groups[GROUP_A_JOURNEY.key] = apply
      ? await applyGroup(client, GROUP_A_JOURNEY, maxIds.customer_journey, batchSize, backupFd, log)
      : await dryRunGroup(client, GROUP_A_JOURNEY, maxIds.customer_journey, log);

    groups[GROUP_B_CUSTOMER.key] = apply
      ? await applyGroup(client, GROUP_B_CUSTOMER, maxIds.customers, batchSize, backupFd, log)
      : await dryRunGroup(client, GROUP_B_CUSTOMER, maxIds.customers, log);

    groups['campaign_customers.first_last_email_sent_at'] = apply
      ? await applyGroupC(client, batchSize, backupFd, log)
      : await dryRunGroupC(client, log);

    // (d) — dry-run LUÔN báo số dòng ứng viên (chỉ đọc, không xoá gì); apply CHỈ xoá khi có cờ.
    let deletedFailedJourney = null;
    if (apply) {
      if (deleteFailedJourney) {
        deletedFailedJourney = await applyDeleteFailedJourney(client, maxIds.customer_journey, batchSize, backupFd, log);
      }
    } else {
      deletedFailedJourney = await dryRunDeleteFailedJourney(client, maxIds.customer_journey, log);
    }

    return { mode: apply ? 'apply' : 'dry-run', maxIds, groups, deletedFailedJourney };
  } finally {
    if (backupFd != null) fs.closeSync(backupFd);
    client.release();
  }
}

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const deleteFailedJourney = argv.includes('--delete-failed-journey');
  const backupFlagIndex = argv.indexOf('--backup-file');
  const backupFile = backupFlagIndex >= 0 ? argv[backupFlagIndex + 1] : undefined;
  const batchSizeFlagIndex = argv.indexOf('--batch-size');
  const batchSize = batchSizeFlagIndex >= 0 ? Number(argv[batchSizeFlagIndex + 1]) : 2000;
  return { apply, backupFile, batchSize, deleteFailedJourney };
}

const isMain = process.argv[1] && process.argv[1].endsWith('backfillEmailDerivedTimestampsToVn.js');
if (isMain) {
  const { apply, backupFile, batchSize, deleteFailedJourney } = parseArgs(process.argv.slice(2));
  runBackfill({ apply, backupFile, batchSize, deleteFailedJourney })
    .then(() => {
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error('[backfill-email-derived-timestamps-vn] failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.pool.end().catch(() => {});
    });
}
