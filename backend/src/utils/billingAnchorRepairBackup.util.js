import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const BILLING_ANCHOR_REPAIR_MIGRATION = '174_repair_billing_cycle_anchors.sql';
const PREFLIGHT_TABLE = 'migration_runner_preflight_backups';

const AFFECTED_ROWS_SQL = `
  WITH active_entitlements AS (
    SELECT u.id,
           u.active_plan_id,
           u.subscription_expires_at,
           u.plan_activated_at,
           u.updated_at,
           COALESCE(p.duration_days, 30)::int AS duration_days
    FROM users u
    JOIN plans p ON p.id = u.active_plan_id
    WHERE u.active_plan_id IS NOT NULL
  ), resolved_activations AS (
    SELECT target.id,
           target.active_plan_id,
           target.subscription_expires_at,
           target.plan_activated_at,
           target.updated_at,
           target.duration_days,
           (
             SELECT ranked.activation_at
             FROM (
               SELECT event.*,
                      MAX(event.checkout_created_at)
                        FILTER (WHERE event.source_priority = 1) OVER ()
                        AS latest_direct_checkout_created_at
               FROM (
               SELECT spc.activated_at AS activation_at,
                      0 AS source_priority,
                      spc.id AS event_id,
                      spc.order_id::bigint AS checkout_order_id,
                      NULL::timestamptz AS checkout_created_at
               FROM scheduled_plan_changes spc
               WHERE spc.user_id = target.id
                 AND spc.plan_id = target.active_plan_id
                 AND spc.status = 'activated'
                 AND spc.activated_at IS NOT NULL
                 AND spc.activated_at <= NOW()

               UNION ALL

               -- Direct fulfillment picks the newest checkout ID when
               -- webhooks arrive out of order. Keep the backup manifest on
               -- that same entitlement winner instead of sorting by paid_at.
               SELECT direct_order.activation_at,
                      1 AS source_priority,
                      direct_order.event_id,
                      direct_order.event_id AS checkout_order_id,
                      direct_order.checkout_created_at
               FROM LATERAL (
                 SELECT COALESCE(o.paid_at, o.created_at) AS activation_at,
                        COALESCE(o.created_at, o.paid_at) AS checkout_created_at,
                        o.id::bigint AS event_id
                 FROM orders o
                 JOIN users u ON u.id = target.id
                 WHERE o.plan_id = target.active_plan_id
                   AND (
                     o.user_id = target.id
                     OR (
                       o.user_id IS NULL
                       AND LOWER(o.user_email) = LOWER(u.email)
                     )
                   )
                   AND o.status IN ('paid', 'success', 'completed')
                   AND o.topup_config IS NULL
                   AND o.note IS DISTINCT FROM 'topup'
                   AND o.note IS DISTINCT FROM 'scheduled_change'
                   AND COALESCE(o.paid_at, o.created_at) <= NOW()
                 ORDER BY o.id DESC
                 LIMIT 1
               ) direct_order
               ) event
             ) ranked
             ORDER BY
               -- A legacy scheduled row has no checkout ID. Keep it ahead of
               -- a direct callback created before activation, but not ahead of
               -- a direct renewal demonstrably created afterwards.
               CASE
                 WHEN ranked.source_priority = 0
                   AND ranked.checkout_order_id IS NULL
                   AND (
                     ranked.latest_direct_checkout_created_at IS NULL
                     OR ranked.latest_direct_checkout_created_at <= ranked.activation_at
                   )
                 THEN 1
                 ELSE 0
               END DESC,
               ranked.checkout_order_id DESC NULLS LAST,
               ranked.source_priority ASC,
               ranked.activation_at DESC,
               ranked.event_id DESC
             LIMIT 1
           ) AS activation_at
    FROM active_entitlements target
  )
  SELECT id,
         active_plan_id,
         -- pg parses TIMESTAMPTZ into JavaScript Date (milliseconds). Keep the
         -- database text here so the preflight manifest retains microseconds
         -- and the migration's IS NOT DISTINCT FROM checks stay exact.
         subscription_expires_at::text AS subscription_expires_at,
         plan_activated_at::text AS plan_activated_at,
         updated_at::text AS updated_at,
         activation_at::text AS activation_at
  FROM resolved_activations
  WHERE activation_at IS NOT NULL
    AND (
      subscription_expires_at IS NULL
      OR activation_at < subscription_expires_at
    )
    AND (
      plan_activated_at IS NULL
      OR plan_activated_at > NOW()
      OR (
        subscription_expires_at IS NOT NULL
        AND plan_activated_at >= subscription_expires_at
      )
      OR (
        subscription_expires_at IS NOT NULL
        AND plan_activated_at = subscription_expires_at
          - (duration_days || ' days')::INTERVAL
        AND ABS(EXTRACT(EPOCH FROM (plan_activated_at - activation_at))) > 300
      )
    )
  ORDER BY id
`;

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function resolveBackupDir(backupDir) {
  const configured = String(backupDir || process.env.BILLING_ANCHOR_BACKUP_DIR || '').trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'BILLING_ANCHOR_BACKUP_DIR là bắt buộc khi chạy migration 174 trên production.'
    );
  }

  return path.resolve(process.cwd(), 'backups');
}

/**
 * Metadata này là preflight state, không phải lịch sử migration. Nó được tạo
 * trước migration 174 và bị migration xóa cùng transaction sau khi repair.
 */
export async function ensureBillingAnchorRepairPreflightTable(queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS ${PREFLIGHT_TABLE} (
      migration_filename VARCHAR(255) PRIMARY KEY,
      backup_path        TEXT NOT NULL,
      content_sha256     CHAR(64) NOT NULL,
      row_count          INTEGER NOT NULL CHECK (row_count >= 0),
      rows               JSONB NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function migrationAlreadyApplied(queryable) {
  const { rows: trackerRows } = await queryable.query(
    "SELECT to_regclass('public.schema_migrations') AS tracker"
  );
  if (!trackerRows[0]?.tracker) return false;

  const { rows } = await queryable.query(
    'SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1',
    [BILLING_ANCHOR_REPAIR_MIGRATION]
  );
  return rows.length > 0;
}

async function usersTableExists(queryable) {
  const { rows } = await queryable.query(
    "SELECT to_regclass('public.users') AS users_table"
  );
  return Boolean(rows[0]?.users_table);
}

/**
 * Create a durable file backup and store its exact eligible-row snapshot in
 * the DB. Migration 174 compares live values with this manifest before each
 * UPDATE, so a payment that commits after this function cannot be overwritten
 * by stale repair data.
 *
 * The file is written before the manifest is committed. A crash can leave an
 * extra file, but can never leave a usable manifest without its file.
 */
export async function prepareBillingAnchorRepairPreflight(queryable, { backupDir } = {}) {
  await ensureBillingAnchorRepairPreflightTable(queryable);

  if (await migrationAlreadyApplied(queryable)) {
    console.log(`[billing-anchor-backup] ${BILLING_ANCHOR_REPAIR_MIGRATION} đã chạy; không cần tạo backup mới.`);
    return { skipped: true };
  }
  if (!(await usersTableExists(queryable))) {
    console.log('[billing-anchor-backup] DB chưa có bảng users; không có entitlement để backup.');
    return { skipped: true };
  }

  // Kiểm tra xem có backup gần đây (trong vòng 3 giờ) chưa — nếu có thì KHÔNG tạo lại
  // để tránh tạo backup liên tục mỗi lần startup trong development
  const { rows: existingBackupRows } = await queryable.query(
    `SELECT 1 FROM ${PREFLIGHT_TABLE} WHERE migration_filename = $1 AND created_at >= NOW() - INTERVAL '3 hours' LIMIT 1`,
    [BILLING_ANCHOR_REPAIR_MIGRATION]
  );
  if (existingBackupRows.length > 0) {
    console.log('[billing-anchor-backup] Đã có backup gần đây (trong 3 giờ); không cần tạo lại.');
    return { skipped: true };
  }

  // A failed/retried preflight must never let migration 174 reuse an old
  // manifest. Delete it before writing the replacement file.
  await queryable.query(
    `DELETE FROM ${PREFLIGHT_TABLE} WHERE migration_filename = $1`,
    [BILLING_ANCHOR_REPAIR_MIGRATION]
  );

  const { rows } = await queryable.query(AFFECTED_ROWS_SQL);
  const createdAt = new Date();
  const content = Buffer.from(`${JSON.stringify({
    migration: BILLING_ANCHOR_REPAIR_MIGRATION,
    createdAt: createdAt.toISOString(),
    rowCount: rows.length,
    rows,
  }, null, 2)}\n`, 'utf8');
  const checksum = createHash('sha256').update(content).digest('hex');
  const targetDir = resolveBackupDir(backupDir);
  const filename = `billing-anchor-repair-before-174-${timestampForFilename(createdAt)}.json`;
  const outputPath = path.join(targetDir, filename);
  const temporaryPath = `${outputPath}.tmp`;

  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, content, { mode: 0o600, flag: 'wx' });
  await rename(temporaryPath, outputPath);

  await queryable.query(
    `INSERT INTO ${PREFLIGHT_TABLE} (
       migration_filename, backup_path, content_sha256, row_count, rows, created_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      BILLING_ANCHOR_REPAIR_MIGRATION,
      outputPath,
      checksum,
      rows.length,
      JSON.stringify(rows),
      createdAt,
    ]
  );

  console.log(
    `[billing-anchor-backup] file=${outputPath} rows=${rows.length} bytes=${content.length} sha256=${checksum}`
  );
  return {
    skipped: false,
    outputPath,
    checksum,
    rowCount: rows.length,
    createdAt,
  };
}
