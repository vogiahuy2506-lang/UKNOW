import db from '../config/database.js';

/**
 * Nhân viên không có gói riêng → dùng gói của owner (membership active đầu tiên).
 *
 * @param {number|string} userId
 * @returns {Promise<number|string|null>}
 */
async function resolveBillingUserId(userId) {
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
 * Trạng thái gói (hết hạn + ân hạn) của user hoặc owner nếu là nhân viên.
 *
 * @param {number|string|null|undefined} userId
 * @returns {Promise<{
 *   hasPlan: boolean,
 *   expiresAt: Date|null,
 *   graceDays: number,
 *   graceUntil: Date|null,
 *   isExpired: boolean,
 *   isInGracePeriod: boolean,
 * }>}
 */
export async function getSubscriptionStatus(userId) {
  const empty = {
    hasPlan: false,
    expiresAt: null,
    graceDays: 0,
    graceUntil: null,
    isExpired: false,
    isInGracePeriod: false,
  };

  if (!userId) return empty;

  const billingUserId = await resolveBillingUserId(userId);
  if (!billingUserId) return empty;

  const { rows } = await db.query(
    `SELECT u.active_plan_id,
            u.subscription_expires_at,
            COALESCE(p.grace_period_days, 0)::int AS grace_period_days
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  const row = rows[0];
  if (!row?.active_plan_id) return empty;

  const graceDays = Number(row.grace_period_days) || 0;
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at) : null;

  let graceUntil = null;
  if (expiresAt) {
    graceUntil = new Date(expiresAt);
    graceUntil.setUTCDate(graceUntil.getUTCDate() + graceDays);
  }

  const now = Date.now();
  const isExpired = expiresAt != null && graceUntil != null && now > graceUntil.getTime();
  const isInGracePeriod = expiresAt != null
    && graceUntil != null
    && now > expiresAt.getTime()
    && now <= graceUntil.getTime();

  return {
    hasPlan: true,
    expiresAt,
    graceDays,
    graceUntil,
    isExpired,
    isInGracePeriod,
  };
}
