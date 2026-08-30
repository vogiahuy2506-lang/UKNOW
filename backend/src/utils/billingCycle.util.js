import db from '../config/database.js';

/**
 * Chỉ active_plan_id mới chứng minh entitlement hiện tại.
 *
 * Đơn thành công là lịch sử thanh toán, không được dùng làm fallback ở các
 * luồng quota/billing: job expire và admin unassign đều chỉ xóa
 * active_plan_id, còn orders vẫn phải được giữ lại để audit.
 * @type {string}
 */
export const EFFECTIVE_PLAN_ID_SQL = 'u.active_plan_id';

/**
 * Resolve the latest activation event for the user's currently active plan.
 * Order history is authoritative for direct activations. When a scheduled
 * change has its source checkout, the greater checkout ID wins across both
 * sources; `paid_at` and `activated_at` are processing times and must not
 * reorder the customer's intent. A legacy scheduled row without an order link
 * wins only when no direct checkout was created after it activated: this
 * preserves delayed callbacks while allowing a demonstrably newer renewal.
 */
export async function findCurrentPlanActivation(userId, queryable = db) {
  if (!userId) return null;
  const { rows } = await queryable.query(
    `WITH target_user AS (
       SELECT u.id, u.email, (${EFFECTIVE_PLAN_ID_SQL}) AS effective_plan_id
       FROM users u
       WHERE u.id = $1
       LIMIT 1
     ), latest_direct_order AS (
       -- Fulfillment uses the newest checkout (orders.id) as the entitlement
       -- winner when PayOS webhooks are delivered out of order. Resolve the
       -- billing period from that same order; paid_at is delivery time, not
       -- checkout intent, so it must not reorder two direct purchases.
       SELECT COALESCE(o.paid_at, o.created_at) AS activation_at,
              COALESCE(o.created_at, o.paid_at) AS checkout_created_at,
              o.billing_period,
              o.plan_id,
              o.id::bigint AS event_id
       FROM orders o
       JOIN target_user u
         ON o.plan_id = u.effective_plan_id
        AND (o.user_id = u.id
          OR (o.user_id IS NULL AND LOWER(o.user_email) = LOWER(u.email)))
       WHERE o.status IN ('paid', 'success', 'completed')
         AND o.topup_config IS NULL
         AND o.note IS DISTINCT FROM 'topup'
         AND o.note IS DISTINCT FROM 'scheduled_change'
         AND o.plan_id IS NOT NULL
         AND COALESCE(o.paid_at, o.created_at) <= NOW()
       ORDER BY o.id DESC
       LIMIT 1
     ), candidates AS (
       SELECT spc.activated_at AS activation_at,
              spc.billing_period,
              spc.plan_id,
              'scheduled'::text AS source,
              0 AS source_priority,
              spc.id::bigint AS event_id,
              spc.order_id::bigint AS checkout_order_id
       FROM scheduled_plan_changes spc
       JOIN target_user u ON u.id = spc.user_id AND u.effective_plan_id = spc.plan_id
       WHERE spc.status = 'activated'
         AND spc.activated_at IS NOT NULL
         AND spc.activated_at <= NOW()
       UNION ALL
       SELECT direct.activation_at,
              direct.billing_period,
              direct.plan_id,
              'order'::text AS source,
              1 AS source_priority,
              direct.event_id,
              direct.event_id AS checkout_order_id
       FROM latest_direct_order direct
     )
     SELECT activation_at, billing_period, plan_id, source, checkout_order_id
     FROM candidates
     WHERE activation_at IS NOT NULL
     ORDER BY
       -- Older migrations did not link the scheduled row to an order. It wins
       -- over a direct callback that was created before it activated, because
       -- paid_at is delivery time. A direct checkout created afterwards is
       -- reliable evidence of a newer customer intent and must win instead.
       CASE
         WHEN source = 'scheduled'
           AND checkout_order_id IS NULL
           AND (
             NOT EXISTS (SELECT 1 FROM latest_direct_order)
             OR (SELECT checkout_created_at FROM latest_direct_order) <= activation_at
           )
         THEN 1
         ELSE 0
       END DESC,
       checkout_order_id DESC NULLS LAST,
       source_priority ASC,
       activation_at DESC,
       event_id DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/** Active plan id for owner alias `o` in membership joins. */
const OWNER_EFFECTIVE_PLAN_ID_SQL = 'o.active_plan_id';

/**
 * @typedef {{ ownerContextId?: number|string|null }} BillingResolveOptions
 */

/**
 * Nhân viên không có gói riêng → dùng gói của owner (membership active đầu tiên).
 * Khi đang ở ngữ cảnh employee (X-Owner-Context), luôn bill theo owner đó.
 *
 * @param {number|string} userId
 * @param {BillingResolveOptions} [options]
 * @returns {Promise<number|string|null>}
 */
export async function resolveBillingUserId(userId, { ownerContextId } = {}, queryable = db) {
  if (ownerContextId != null && ownerContextId !== '') {
    return Number(ownerContextId);
  }

  const { rows } = await queryable.query(
    `SELECT (${EFFECTIVE_PLAN_ID_SQL}) AS effective_plan_id
       FROM users u
      WHERE u.id = $1
      LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.effective_plan_id) return userId;

  const { rows: memberRows } = await queryable.query(
    `SELECT um.owner_id
     FROM user_members um
     JOIN users o ON o.id = um.owner_id
     WHERE um.employee_id = $1
       AND um.status = 'active'
       AND (${OWNER_EFFECTIVE_PLAN_ID_SQL}) IS NOT NULL
     ORDER BY um.created_at ASC
     LIMIT 1`,
    [userId]
  );
  return memberRows[0]?.owner_id ?? userId;
}

/**
 * Tính cửa sổ chu kỳ [cycleStart, cycleEnd] chứa `now`, đếm xuôi từ ngày kích hoạt (plan_activated_at).
 *
 * Chu kỳ hạn mức = đúng 30 ngày, đếm xuôi từ anchorStart (ngày kích hoạt gói).
 * cycleIndex = floor((now - anchorStart) / 30 ngày)
 * cycleStart = anchorStart + cycleIndex * 30 ngày
 * cycleEnd = cycleStart + 30 ngày
 *
 * @param {Date|string|number} anchorStart - mốc kích hoạt (plan_activated_at)
 * @param {number} [durationDays=30] - số ngày mỗi chu kỳ (mặc định 30)
 * @param {Date} [now=new Date()]
 * @returns {{ cycleStart: Date, cycleEnd: Date }}
 */
export function computeBillingWindow(anchorStart, durationDays = 30, now = new Date()) {
  const duration = Number(durationDays) || 30;
  const startMs = new Date(anchorStart).getTime();
  const nowMs = now.getTime();
  const cycleMs = duration * 86400000;

  if (nowMs < startMs) {
    const cycleStart = new Date(startMs);
    const cycleEnd = new Date(startMs + cycleMs);
    return { cycleStart, cycleEnd };
  }

  const cycleIndex = Math.floor((nowMs - startMs) / cycleMs);
  const cycleStart = new Date(startMs + cycleIndex * cycleMs);
  const cycleEnd = new Date(cycleStart.getTime() + cycleMs);

  return { cycleStart, cycleEnd };
}

/**
 * Chu kỳ thanh toán hiện tại: [cycleStart, cycleEnd] neo theo chu kỳ 30 ngày từ plan_activated_at.
 *
 * @param {number|string|null|undefined} userId
 * @param {BillingResolveOptions} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable=db]
 * @returns {Promise<{
 *   hasPlan: boolean,
 *   billingUserId: number|string|null,
 *   cycleStart: Date|null,
 *   cycleEnd: Date|null,
 *   durationDays: number,
 * }>}
 */
export async function getBillingCycle(userId, options = {}, queryable = db) {
  const empty = {
    hasPlan: false,
    billingUserId: null,
    cycleStart: null,
    cycleEnd: null,
    durationDays: 30,
  };

  if (!userId) return empty;

  const billingUserId = await resolveBillingUserId(userId, options, queryable);
  if (!billingUserId) return empty;

  const { rows } = await queryable.query(
    `SELECT (${EFFECTIVE_PLAN_ID_SQL}) AS effective_plan_id,
            u.subscription_expires_at,
            u.plan_activated_at,
            u.created_at,
            COALESCE(p.duration_days, 30)::int AS duration_days
     FROM users u
     LEFT JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  const row = rows[0];
  if (!row?.effective_plan_id) {
    return { ...empty, billingUserId };
  }

  let anchorStart;
  const storedAnchor = row.plan_activated_at ? new Date(row.plan_activated_at) : null;
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;
  const now = new Date();
  const durationDays = Number(row.duration_days) || 30;
  const storedAnchorValid = storedAnchor
    && !Number.isNaN(storedAnchor.getTime())
    && storedAnchor <= now
    && (!expiresAt || Number.isNaN(expiresAt.getTime()) || storedAnchor < expiresAt);
  // Migration 150 derived an anchor from expiry. For an annual entitlement in
  // its last 30 days that timestamp is in the past and superficially valid,
  // but it still resets the quota cycle away from the actual activation event.
  // Ask the shared resolver in this narrow signature; if no evidence exists,
  // retain the otherwise-valid stored value rather than inventing a new anchor.
  const expiryDerivedAnchor = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? new Date(expiresAt.getTime() - durationDays * 86400000)
    : null;
  const storedAnchorLooksExpiryDerived = storedAnchorValid
    && expiryDerivedAnchor
    && Math.abs(storedAnchor.getTime() - expiryDerivedAnchor.getTime()) <= 1000;

  if (storedAnchorValid && !storedAnchorLooksExpiryDerived) {
    anchorStart = storedAnchor;
  } else {
    const activation = await findCurrentPlanActivation(billingUserId, queryable);
    const eventAnchor = activation?.activation_at ? new Date(activation.activation_at) : null;
    const eventAnchorValid = eventAnchor
      && !Number.isNaN(eventAnchor.getTime())
      && eventAnchor <= now
      && (!expiresAt || Number.isNaN(expiresAt.getTime()) || eventAnchor < expiresAt);
    if (eventAnchorValid) {
      anchorStart = eventAnchor;
    } else if (storedAnchorValid) {
      anchorStart = storedAnchor;
    } else {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      anchorStart = createdAt && !Number.isNaN(createdAt.getTime()) && createdAt <= now
        ? createdAt
        // `created_at` is non-null in the schema. If legacy/corrupt data still
        // lacks a usable value, use a deterministic epoch anchor rather than
        // moving the quota window on every request.
        : new Date(0);
    }
  }

  const { cycleStart, cycleEnd } = computeBillingWindow(anchorStart, 30, now);

  return {
    hasPlan: true,
    billingUserId,
    cycleStart,
    cycleEnd,
    durationDays: 30,
  };
}
