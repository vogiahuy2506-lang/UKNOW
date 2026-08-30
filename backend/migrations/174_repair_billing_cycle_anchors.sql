-- Repair quota-cycle anchors created by migration 150 for yearly plans.
--
-- Besides impossible anchors (NULL/future/after expiry), migration 150 could
-- leave a past-but-wrong value for an annual subscription already in its final
-- 30 days: `subscription_expires_at - duration_days` looks valid but is not the
-- plan activation. Only rows with an active entitlement and a trustworthy
-- matching activation event are changed. Do not alter entitlement, expiry,
-- orders, or usage.
--
-- A preflight script writes both a VPS-only JSON backup and an exact row
-- snapshot into `migration_runner_preflight_backups`. The snapshot prevents a
-- concurrently completed payment from being overwritten by this repair.
BEGIN;

-- The preflight utility normally creates this table before the runner reaches
-- this migration. Defining it here too keeps a clean database self-contained:
-- `npm run migrate` must not depend on an out-of-band command merely to create
-- metadata needed by a later migration.
CREATE TABLE IF NOT EXISTS migration_runner_preflight_backups (
  migration_filename VARCHAR(255) PRIMARY KEY,
  backup_path        TEXT NOT NULL,
  content_sha256     CHAR(64) NOT NULL,
  row_count          INTEGER NOT NULL CHECK (row_count >= 0),
  rows               JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep only operational evidence after the snapshot is consumed. The original
-- snapshot is deleted below; this table contains no customer fields and lets
-- deploy/audit distinguish a complete repair from rows skipped by the race
-- guard.
CREATE TABLE IF NOT EXISTS migration_runner_repair_results (
  migration_filename  VARCHAR(255) PRIMARY KEY,
  backup_path         TEXT NOT NULL,
  content_sha256      CHAR(64) NOT NULL,
  preflight_row_count INTEGER NOT NULL CHECK (preflight_row_count >= 0),
  repaired_row_count  INTEGER NOT NULL CHECK (repaired_row_count >= 0),
  skipped_row_count   INTEGER NOT NULL CHECK (skipped_row_count >= 0),
  preflight_created_at TIMESTAMPTZ NOT NULL,
  completed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  -- `row_count` is used for the durable repair report below. The preflight
  -- writer always supplies an array, but reject corrupted/manual manifests
  -- instead of publishing an incorrect repaired/skipped count.
  IF EXISTS (
    SELECT 1
    FROM migration_runner_preflight_backups
    WHERE migration_filename = '174_repair_billing_cycle_anchors.sql'
      AND NOT CASE
        WHEN jsonb_typeof(rows) = 'array' THEN jsonb_array_length(rows) = row_count
        ELSE FALSE
      END
  ) THEN
    RAISE EXCEPTION
      'Migration 174 preflight manifest is invalid: row_count does not match rows.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM migration_runner_preflight_backups
    WHERE migration_filename = '174_repair_billing_cycle_anchors.sql'
      AND created_at >= NOW() - INTERVAL '2 hours'
  )
  -- A brand-new database has no entitlement history to repair, so it may
  -- safely cross this migration without a backup. Once any active entitlement
  -- exists, retain the fail-closed preflight requirement.
  AND EXISTS (
    SELECT 1
    FROM users
    WHERE active_plan_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Migration 174 requires a fresh billing-anchor preflight backup; run npm run backup:billing-anchor-repair first.';
  END IF;
END
$$;

-- Entitlement writes update `users`. Hold this lock through the repair so a
-- writer that starts after this point commits after the repaired anchor.
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;

WITH preflight_snapshot AS (
  SELECT snapshot.*
  FROM migration_runner_preflight_backups backup
  CROSS JOIN LATERAL jsonb_to_recordset(backup.rows) AS snapshot(
    id BIGINT,
    active_plan_id BIGINT,
    subscription_expires_at TIMESTAMPTZ,
    plan_activated_at TIMESTAMPTZ,
    activation_at TIMESTAMPTZ
  )
  WHERE backup.migration_filename = '174_repair_billing_cycle_anchors.sql'
), active_entitlements AS (
  SELECT u.id,
         u.active_plan_id,
         u.subscription_expires_at,
         u.plan_activated_at,
         COALESCE(p.duration_days, 30)::int AS duration_days
  FROM users u
  JOIN plans p ON p.id = u.active_plan_id
  WHERE u.active_plan_id IS NOT NULL
), resolved_activations AS (
  SELECT target.id,
         target.active_plan_id,
         target.subscription_expires_at,
         target.plan_activated_at,
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

             -- Match payment fulfillment: among direct purchases for this
             -- active plan, the newest checkout intent wins even if PayOS
             -- delivers an older webhook later and gives it a newer paid_at.
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
             -- Processing timestamps are not customer intent. Prefer the
             -- linked checkout sequence across direct/scheduled sources. A
             -- legacy scheduled row only wins over a direct checkout that was
             -- created before it activated, so a newer direct renewal wins.
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
), repaired AS (
UPDATE users u
SET plan_activated_at = resolved.activation_at,
    updated_at = CURRENT_TIMESTAMP
FROM resolved_activations resolved
JOIN preflight_snapshot snapshot ON snapshot.id = resolved.id
WHERE u.id = resolved.id
  -- The resolver must still see exactly the entitlement/event captured by the
  -- backup. This rejects rows changed after preflight but before this statement.
  AND resolved.active_plan_id IS NOT DISTINCT FROM snapshot.active_plan_id
  AND resolved.subscription_expires_at IS NOT DISTINCT FROM snapshot.subscription_expires_at
  AND resolved.plan_activated_at IS NOT DISTINCT FROM snapshot.plan_activated_at
  AND resolved.activation_at IS NOT DISTINCT FROM snapshot.activation_at
  -- PostgreSQL can re-check an UPDATE after waiting for a concurrent writer.
  -- Compare the live target as well, otherwise a stale CTE could overwrite the
  -- plan_activated_at written by a payment that obtained the row lock first.
  AND u.active_plan_id IS NOT DISTINCT FROM snapshot.active_plan_id
  AND u.subscription_expires_at IS NOT DISTINCT FROM snapshot.subscription_expires_at
  AND u.plan_activated_at IS NOT DISTINCT FROM snapshot.plan_activated_at
  AND resolved.activation_at IS NOT NULL
  AND (
    resolved.subscription_expires_at IS NULL
    OR resolved.activation_at < resolved.subscription_expires_at
  )
  AND (
    resolved.plan_activated_at IS NULL
    OR resolved.plan_activated_at > NOW()
    OR (
      resolved.subscription_expires_at IS NOT NULL
      AND resolved.plan_activated_at >= resolved.subscription_expires_at
    )
    OR (
      resolved.subscription_expires_at IS NOT NULL
      AND resolved.plan_activated_at = resolved.subscription_expires_at
        - (resolved.duration_days || ' days')::INTERVAL
      AND ABS(EXTRACT(EPOCH FROM (resolved.plan_activated_at - resolved.activation_at))) > 300
    )
  )
  RETURNING u.id
), repair_summary AS (
  SELECT COUNT(*)::int AS repaired_row_count
  FROM repaired
)
INSERT INTO migration_runner_repair_results (
  migration_filename,
  backup_path,
  content_sha256,
  preflight_row_count,
  repaired_row_count,
  skipped_row_count,
  preflight_created_at,
  completed_at
)
SELECT backup.migration_filename,
       backup.backup_path,
       backup.content_sha256,
       backup.row_count,
       summary.repaired_row_count,
       GREATEST(backup.row_count - summary.repaired_row_count, 0),
       backup.created_at,
       CURRENT_TIMESTAMP
FROM migration_runner_preflight_backups backup
CROSS JOIN repair_summary summary
WHERE backup.migration_filename = '174_repair_billing_cycle_anchors.sql'
ON CONFLICT (migration_filename) DO UPDATE
SET backup_path = EXCLUDED.backup_path,
    content_sha256 = EXCLUDED.content_sha256,
    preflight_row_count = EXCLUDED.preflight_row_count,
    repaired_row_count = EXCLUDED.repaired_row_count,
    skipped_row_count = EXCLUDED.skipped_row_count,
    preflight_created_at = EXCLUDED.preflight_created_at,
    completed_at = EXCLUDED.completed_at;

-- The external JSON file and result row remain as rollback/audit evidence.
-- Remove the DB snapshot only when this transaction commits, so a failed run
-- can be retried safely with a new preflight backup.
DELETE FROM migration_runner_preflight_backups
WHERE migration_filename = '174_repair_billing_cycle_anchors.sql';

COMMIT;
