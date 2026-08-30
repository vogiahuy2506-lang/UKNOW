#!/usr/bin/env node
/** Read-only audit for billing period/anchor inconsistencies. */
import 'dotenv/config';
import db from '../src/config/database.js';

const { rows } = await db.query(`
  SELECT u.id AS user_id, u.email, u.active_plan_id,
         p.code AS active_plan_code, p.name AS active_plan_name,
         COALESCE(p.duration_days, 30)::int AS active_plan_duration_days,
         u.plan_activated_at,
         u.subscription_expires_at,
         activation.order_id,
         activation.order_code,
         activation.billing_period,
         activation.paid_at,
         activation.created_at,
         activation.scheduled_change_id,
         activation.scheduled_change_status,
         activation.scheduled_activated_at,
         activation.activation_at,
         latest_order.id AS latest_order_id,
         latest_order.order_code AS latest_order_code,
         latest_order.plan_id AS latest_order_plan_id,
         latest_order.billing_period AS latest_order_billing_period,
         latest_order.paid_at AS latest_order_paid_at,
         latest_order.created_at AS latest_order_created_at,
         latest_order_plan.code AS latest_order_plan_code,
         concat_ws('; ',
           CASE WHEN u.plan_activated_at IS NULL THEN 'missing_anchor' END,
           CASE WHEN u.plan_activated_at > NOW() THEN 'future_anchor' END,
           CASE WHEN u.subscription_expires_at IS NOT NULL
                     AND u.plan_activated_at >= u.subscription_expires_at
                THEN 'anchor_after_expiry' END,
           CASE WHEN activation.activation_at IS NOT NULL
                     AND u.subscription_expires_at IS NOT NULL
                     AND u.plan_activated_at = u.subscription_expires_at
                       - (COALESCE(p.duration_days, 30) || ' days')::interval
                     AND ABS(EXTRACT(EPOCH FROM (u.plan_activated_at - activation.activation_at))) > 300
                THEN 'anchor_matches_expiry_backfill_not_activation' END,
           CASE WHEN latest_order.plan_id IS NOT NULL
                     AND latest_order.plan_id IS DISTINCT FROM u.active_plan_id
                THEN 'latest_order_plan_mismatch' END,
           CASE WHEN activation.activation_at IS NULL THEN 'no_activation_evidence' END
         ) AS flag_reason
  FROM users u
  LEFT JOIN plans p ON p.id = u.active_plan_id
  LEFT JOIN LATERAL (
    SELECT event.activation_at,
           event.billing_period,
           event.order_id,
           event.order_code,
           event.paid_at,
           event.created_at,
           event.scheduled_change_id,
           event.scheduled_change_status,
           event.scheduled_activated_at
    FROM (
      SELECT candidate.*,
             MAX(candidate.checkout_created_at)
               FILTER (WHERE candidate.source_priority = 1) OVER ()
               AS latest_direct_checkout_created_at
      FROM (
        SELECT spc.activated_at AS activation_at,
             spc.billing_period,
             scheduled_order.id AS order_id,
             scheduled_order.order_code::text AS order_code,
             scheduled_order.paid_at,
             scheduled_order.created_at,
             spc.id AS scheduled_change_id,
             spc.status AS scheduled_change_status,
             spc.activated_at AS scheduled_activated_at,
             0 AS source_priority,
             spc.id::bigint AS event_id,
             spc.order_id::bigint AS checkout_order_id,
             NULL::timestamptz AS checkout_created_at
      FROM scheduled_plan_changes spc
      LEFT JOIN orders scheduled_order ON scheduled_order.id = spc.order_id
      WHERE spc.user_id = u.id
        AND spc.plan_id = u.active_plan_id
        AND spc.status = 'activated'
        AND spc.activated_at IS NOT NULL
        AND spc.activated_at <= NOW()
      UNION ALL
      -- Payment fulfillment retains the newest checkout intent when PayOS
      -- sends webhooks out of order. Audit the same direct order, rather than
      -- letting a late paid_at make an older monthly checkout look current.
      SELECT direct_order.activation_at,
             direct_order.billing_period,
             direct_order.order_id,
             direct_order.order_code,
             direct_order.paid_at,
             direct_order.created_at,
             NULL::bigint AS scheduled_change_id,
             NULL::text AS scheduled_change_status,
             NULL::timestamptz AS scheduled_activated_at,
             1 AS source_priority,
             direct_order.event_id,
             direct_order.event_id AS checkout_order_id,
             direct_order.checkout_created_at
      FROM LATERAL (
        SELECT COALESCE(o.paid_at, o.created_at) AS activation_at,
               COALESCE(o.created_at, o.paid_at) AS checkout_created_at,
               o.billing_period,
               o.id AS order_id,
               o.order_code::text AS order_code,
               o.paid_at,
               o.created_at,
               o.id::bigint AS event_id
        FROM orders o
        WHERE o.plan_id = u.active_plan_id
          AND (o.user_id = u.id
            OR (o.user_id IS NULL AND LOWER(o.user_email) = LOWER(u.email)))
          AND o.status IN ('paid', 'success', 'completed')
          AND o.topup_config IS NULL
          AND o.note IS DISTINCT FROM 'topup'
          AND o.note IS DISTINCT FROM 'scheduled_change'
          AND COALESCE(o.paid_at, o.created_at) IS NOT NULL
          AND COALESCE(o.paid_at, o.created_at) <= NOW()
        ORDER BY o.id DESC
        LIMIT 1
      ) direct_order
      ) candidate
    ) event
    ORDER BY
      CASE
        WHEN event.source_priority = 0
          AND event.checkout_order_id IS NULL
          AND (
            event.latest_direct_checkout_created_at IS NULL
            OR event.latest_direct_checkout_created_at <= event.activation_at
          )
        THEN 1
        ELSE 0
      END DESC,
      event.checkout_order_id DESC NULLS LAST,
      event.source_priority ASC,
      event.activation_at DESC,
      event.event_id DESC
    LIMIT 1
  ) activation ON TRUE
  LEFT JOIN LATERAL (
    SELECT o.id, o.order_code, o.plan_id, o.billing_period, o.paid_at, o.created_at
    FROM orders o
    WHERE (o.user_id = u.id
      OR (o.user_id IS NULL AND LOWER(o.user_email) = LOWER(u.email)))
      AND o.status IN ('paid', 'success', 'completed')
      AND o.plan_id IS NOT NULL
      AND o.topup_config IS NULL
      AND o.note IS DISTINCT FROM 'topup'
      AND o.note IS DISTINCT FROM 'scheduled_change'
    -- Same winner rule as fulfillment. paid_at is callback arrival time, not
    -- the customer intent used to decide the active entitlement.
    ORDER BY o.id DESC
    LIMIT 1
  ) latest_order ON TRUE
  LEFT JOIN plans latest_order_plan ON latest_order_plan.id = latest_order.plan_id
  WHERE u.active_plan_id IS NOT NULL
    AND (u.plan_activated_at IS NULL
      OR u.plan_activated_at > NOW()
      OR (u.subscription_expires_at IS NOT NULL
          AND u.plan_activated_at >= u.subscription_expires_at)
      OR (activation.activation_at IS NOT NULL
          AND u.subscription_expires_at IS NOT NULL
          AND u.plan_activated_at = u.subscription_expires_at
            - (COALESCE(p.duration_days, 30) || ' days')::interval
          AND ABS(EXTRACT(EPOCH FROM (u.plan_activated_at - activation.activation_at))) > 300)
      OR (latest_order.plan_id IS NOT NULL
          AND latest_order.plan_id IS DISTINCT FROM u.active_plan_id)
      OR activation.activation_at IS NULL)
  ORDER BY u.id, activation.activation_at DESC NULLS LAST
`);

console.table(rows);
console.log(`[billing-audit] ${rows.length} row(s)`);

const { rows: repairResultTable } = await db.query(
  "SELECT to_regclass('public.migration_runner_repair_results') AS table_name"
);
if (repairResultTable[0]?.table_name) {
  const { rows: repairRows } = await db.query(`
    SELECT migration_filename,
           preflight_row_count,
           repaired_row_count,
           skipped_row_count,
           backup_path,
           content_sha256,
           preflight_created_at,
           completed_at
    FROM migration_runner_repair_results
    ORDER BY completed_at DESC, migration_filename
    LIMIT 20
  `);
  console.table(repairRows);
  console.log(`[billing-audit] ${repairRows.length} migration repair result(s)`);
} else {
  console.log('[billing-audit] Chưa có migration repair result nào.');
}

const { rows: voucherRows } = await db.query(`
  SELECT o.id AS order_id,
         o.order_code,
         o.user_id,
         o.user_email,
         o.voucher_code AS order_voucher_code,
         v.code AS redemption_voucher_code,
         o.discount_amount,
         vr.id AS redemption_id
  FROM orders o
  JOIN voucher_redemptions vr ON vr.order_id = o.id
  JOIN vouchers v ON v.id = vr.voucher_id
  WHERE o.voucher_code IS NULL
     OR TRIM(o.voucher_code) = ''
     OR LOWER(TRIM(o.voucher_code)) <> LOWER(TRIM(v.code))
  ORDER BY o.created_at, o.id
`);
console.table(voucherRows);
console.log(`[billing-audit] ${voucherRows.length} voucher snapshot mismatch row(s)`);

await db.pool.end();
