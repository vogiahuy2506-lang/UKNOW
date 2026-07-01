import db from '../config/database.js';

/**
 * COALESCE(active_plan_id, gói từ order mới nhất) — khớp findProfilePlan.
 * @type {string}
 */
export const EFFECTIVE_PLAN_ID_SQL = `COALESCE(
  u.active_plan_id,
  (SELECT o.plan_id FROM orders o
   WHERE o.user_id = u.id OR o.user_email = u.email
   ORDER BY o.created_at DESC LIMIT 1)
)`;

/**
 * Nhân viên không có gói riêng → dùng gói của owner (membership active đầu tiên).
 *
 * @param {number|string} userId
 * @returns {Promise<number|string|null>}
 */
export async function resolveBillingUserId(userId) {
  const { rows } = await db.query(
    `SELECT active_plan_id FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.active_plan_id) return userId;

  const { rows: memberRows } = await db.query(
    `SELECT um.owner_id
     FROM user_members um
     JOIN users o ON o.id = um.owner_id
     WHERE um.employee_id = $1
       AND um.status = 'active'
       AND o.active_plan_id IS NOT NULL
     ORDER BY um.created_at ASC
     LIMIT 1`,
    [userId]
  );
  return memberRows[0]?.owner_id ?? userId;
}

/**
 * Chu kỳ thanh toán hiện tại: [cycleStart, cycleEnd] với cycleEnd = subscription_expires_at.
 *
 * @param {number|string|null|undefined} userId
 * @returns {Promise<{
 *   hasPlan: boolean,
 *   billingUserId: number|string|null,
 *   cycleStart: Date|null,
 *   cycleEnd: Date|null,
 *   durationDays: number,
 * }>}
 */
export async function getBillingCycle(userId) {
  const empty = {
    hasPlan: false,
    billingUserId: null,
    cycleStart: null,
    cycleEnd: null,
    durationDays: 30,
  };

  if (!userId) return empty;

  const billingUserId = await resolveBillingUserId(userId);
  if (!billingUserId) return empty;

  const { rows } = await db.query(
    `SELECT (${EFFECTIVE_PLAN_ID_SQL}) AS effective_plan_id,
            u.subscription_expires_at,
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

  const durationDays = Number(row.duration_days) || 30;
  const cycleEnd = row.subscription_expires_at ? new Date(row.subscription_expires_at) : new Date();
  const cycleStart = new Date(cycleEnd);
  cycleStart.setUTCDate(cycleStart.getUTCDate() - durationDays);

  return {
    hasPlan: true,
    billingUserId,
    cycleStart,
    cycleEnd,
    durationDays,
  };
}
