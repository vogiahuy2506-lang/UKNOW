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

/** Effective plan id for owner alias `o` in membership joins. */
const OWNER_EFFECTIVE_PLAN_ID_SQL = `COALESCE(
  o.active_plan_id,
  (SELECT ord.plan_id FROM orders ord
   WHERE ord.user_id = o.id OR ord.user_email = o.email
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
export async function resolveBillingUserId(userId, { ownerContextId } = {}) {
  if (ownerContextId != null && ownerContextId !== '') {
    return Number(ownerContextId);
  }

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
       AND (${OWNER_EFFECTIVE_PLAN_ID_SQL}) IS NOT NULL
     ORDER BY um.created_at ASC
     LIMIT 1`,
    [userId]
  );
  return memberRows[0]?.owner_id ?? userId;
}

/**
 * Tính cửa sổ chu kỳ [cycleStart, cycleEnd] chứa `now`, neo theo ngày hết hạn.
 *
 * subscription_expires_at là mốc kết thúc kỳ. Nếu expiry ở xa trong tương lai
 * (> 1 chu kỳ so với now — ví dụ gói vừa mua/gia hạn hoặc admin set hạn xa),
 * cần lùi cửa sổ theo từng `durationDays` cho tới khi chứa `now`. Nếu không,
 * usage hôm nay sẽ nằm ngoài [cycleStart, cycleEnd] và không bao giờ được đếm.
 *
 * @param {Date|string|number} anchorEnd - mốc hết hạn (subscription_expires_at)
 * @param {number} durationDays
 * @param {Date} [now]
 * @returns {{ cycleStart: Date, cycleEnd: Date }}
 */
export function computeBillingWindow(anchorEnd, durationDays, now = new Date()) {
  const duration = Number(durationDays) || 30;
  let cycleEnd = new Date(anchorEnd);
  let cycleStart = new Date(cycleEnd);
  cycleStart.setUTCDate(cycleStart.getUTCDate() - duration);

  // Lùi về đúng chu kỳ chứa now (guard chống lặp vô hạn khi dữ liệu bất thường).
  let guard = 0;
  while (cycleStart.getTime() > now.getTime() && guard < 600) {
    cycleEnd = cycleStart;
    cycleStart = new Date(cycleEnd);
    cycleStart.setUTCDate(cycleStart.getUTCDate() - duration);
    guard += 1;
  }

  return { cycleStart, cycleEnd };
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
export async function getBillingCycle(userId, options = {}) {
  const empty = {
    hasPlan: false,
    billingUserId: null,
    cycleStart: null,
    cycleEnd: null,
    durationDays: 30,
  };

  if (!userId) return empty;

  const billingUserId = await resolveBillingUserId(userId, options);
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
  const anchorEnd = row.subscription_expires_at ? new Date(row.subscription_expires_at) : new Date();
  const { cycleStart, cycleEnd } = computeBillingWindow(anchorEnd, durationDays);

  return {
    hasPlan: true,
    billingUserId,
    cycleStart,
    cycleEnd,
    durationDays,
  };
}
