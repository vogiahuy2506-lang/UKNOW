import db from '../config/database.js';
import { EFFECTIVE_PLAN_ID_SQL, resolveBillingUserId } from './billingCycle.util.js';

/**
 * Trạng thái gói (hết hạn + ân hạn) của user hoặc owner nếu là nhân viên.
 *
 * @param {number|string|null|undefined} userId
 * @param {{ ownerContextId?: number|string|null }} [options]
 * @returns {Promise<{
 *   hasPlan: boolean,
 *   expiresAt: Date|null,
 *   graceDays: number,
 *   graceUntil: Date|null,
 *   isExpired: boolean,
 *   isInGracePeriod: boolean,
 * }>}
 */
export async function getSubscriptionStatus(userId, options = {}) {
  const empty = {
    hasPlan: false,
    expiresAt: null,
    graceDays: 0,
    graceUntil: null,
    isExpired: false,
    isInGracePeriod: false,
  };

  if (!userId) return empty;

  const billingUserId = await resolveBillingUserId(userId, options);
  if (!billingUserId) return empty;

  const { rows } = await db.query(
    `SELECT (${EFFECTIVE_PLAN_ID_SQL}) AS effective_plan_id,
            u.subscription_expires_at,
            COALESCE(p.grace_period_days, 0)::int AS grace_period_days
     FROM users u
     LEFT JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1
     LIMIT 1`,
    [billingUserId]
  );
  const row = rows[0];
  if (!row?.effective_plan_id) return empty;

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
