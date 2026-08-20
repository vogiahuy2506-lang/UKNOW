import db from '../config/database.js';

/**
 * COALESCE(active_plan_id, gói từ order mới nhất) — khớp findProfilePlan.
 * @type {string}
 */
export const EFFECTIVE_PLAN_ID_SQL = `COALESCE(
  u.active_plan_id,
  (SELECT o.plan_id FROM orders o
   WHERE (o.user_id = u.id OR o.user_email = u.email)
     AND o.status = 'success'
   ORDER BY o.created_at DESC LIMIT 1)
)`;

/** Effective plan id for owner alias `o` in membership joins. */
const OWNER_EFFECTIVE_PLAN_ID_SQL = `COALESCE(
  o.active_plan_id,
  (SELECT ord.plan_id FROM orders ord
   WHERE (ord.user_id = o.id OR ord.user_email = o.email)
     AND ord.status = 'success'
   ORDER BY ord.created_at DESC LIMIT 1)
)`;

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
    `SELECT active_plan_id FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.active_plan_id) return userId;

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
  if (row.plan_activated_at) {
    anchorStart = new Date(row.plan_activated_at);
  } else if (row.subscription_expires_at) {
    const durationDays = Number(row.duration_days) || 30;
    anchorStart = new Date(new Date(row.subscription_expires_at).getTime() - durationDays * 86400000);
  } else {
    anchorStart = new Date();
  }

  const { cycleStart, cycleEnd } = computeBillingWindow(anchorStart, 30);

  return {
    hasPlan: true,
    billingUserId,
    cycleStart,
    cycleEnd,
    durationDays: 30,
  };
}
