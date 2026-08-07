import db from '../../config/database.js';
import { getPlanByUserId } from '../../repositories/payment/plan.repository.js';
import { sumActiveTopupGrants } from '../../repositories/payment/topup.repository.js';
import {
  LOCKABLE_RESOURCE_KEYS,
  isResourceLocked as repoIsLocked,
  filterLockedResources as repoFilterLocked,
  deleteOrphanLocks,
  countValidLocks,
  countResourcesInUse,
  listUnlockedResourceIds,
  listLockedResourceIds,
  insertLock,
  deleteLock,
  replaceLocksForUser,
  listResourcesWithLockStatus,
  findUsersWithExpiredStructuralGrants,
  findUsersWithLocks,
  findExpiringStructuralGrants,
  incrementGrantReminderCount,
} from '../../repositories/payment/topupLock.repository.js';

export {
  isResourceLocked,
  filterLockedResources,
} from '../../repositories/payment/topupLock.repository.js';

export { LOCKABLE_RESOURCE_KEYS };

const PLAN_CEILING = Object.freeze({
  zalo_accounts: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_zalo_accounts FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return Number(rows[0]?.max_zalo_accounts) || 0;
  },
  email_accounts: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_email_accounts FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return Number(rows[0]?.max_email_accounts) || 0;
  },
  landing_pages: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_landing_pages FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return Number(rows[0]?.max_landing_pages) || 0;
  },
  chatbots: async (userId, queryable) => {
    const plan = await getPlanByUserId(userId, queryable);
    return Number(plan?.max_chatbots) || 0;
  },
});

/** Nhãn tiếng Việt cho email nhắc / báo khoá — không in item_key thô. */
export const STRUCTURAL_ITEM_LABELS_VI = Object.freeze({
  zalo_accounts: 'tài khoản Zalo',
  email_accounts: 'tài khoản Email',
  landing_pages: 'landing page',
  chatbots: 'chatbot',
  employees: 'nhân viên',
});

export function structuralItemLabelVi(itemKey) {
  return STRUCTURAL_ITEM_LABELS_VI[itemKey] || itemKey;
}

/**
 * Resolve plan ceiling + active structural grants for one resource.
 * @param {number|string} userId
 * @param {string} resourceKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function resolveEffectiveCeiling(userId, resourceKey, queryable = db) {
  const ceilingFn = PLAN_CEILING[resourceKey];
  if (!ceilingFn) return 0;
  const planCeiling = await ceilingFn(userId, queryable);
  const grants = await sumActiveTopupGrants(userId, resourceKey, queryable);
  return Math.max(0, planCeiling) + Math.max(0, Number(grants) || 0);
}

/**
 * Bidirectional reconcile: lock excess newest-first; unlock most-recently-locked first.
 * Must pass transaction `client` when called from webhook fulfillTopupOrder.
 *
 * @param {number|string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<{ locked: Array<{resourceKey:string, resourceId:number}>, unlocked: Array<{resourceKey:string, resourceId:number}> }>}
 */
export async function reconcileResourceLocks(userId, queryable = db) {
  const locked = [];
  const unlocked = [];

  for (const resourceKey of LOCKABLE_RESOURCE_KEYS) {
    await deleteOrphanLocks(userId, resourceKey, queryable);

    const effective = await resolveEffectiveCeiling(userId, resourceKey, queryable);
    const inUse = await countResourcesInUse(userId, resourceKey, queryable);
    const lockedCount = await countValidLocks(userId, resourceKey, queryable);
    const running = inUse - lockedCount;

    if (running > effective) {
      const need = running - effective;
      const candidates = await listUnlockedResourceIds(userId, resourceKey, queryable);
      for (const resourceId of candidates.slice(0, need)) {
        await insertLock(userId, resourceKey, resourceId, queryable);
        locked.push({ resourceKey, resourceId });
      }
    } else if (running < effective) {
      const need = effective - running;
      const candidates = await listLockedResourceIds(userId, resourceKey, queryable);
      for (const resourceId of candidates.slice(0, need)) {
        await deleteLock(resourceKey, resourceId, queryable);
        unlocked.push({ resourceKey, resourceId });
      }
    }
  }

  return { locked, unlocked };
}

/**
 * Cron entry: user hết hạn gói + user có grant cấu trúc vừa hết hạn + user đang bị khoá.
 *
 * Tập thứ ba là lưới an toàn cho chiều mở khoá — xem `findUsersWithLocks`.
 */
export async function reconcileAllDueUsers(queryable = db) {
  const { findExpiredUsers } = await import('../../repositories/subscription/subscription.repository.js');
  const expiredPlan = await findExpiredUsers();
  const expiredGrants = await findUsersWithExpiredStructuralGrants(7, queryable);
  const locked = await findUsersWithLocks(queryable);

  const userIds = new Set([
    ...expiredPlan.map((u) => Number(u.id)),
    ...expiredGrants.map((u) => Number(u.id)),
    ...locked.map((u) => Number(u.id)),
  ]);

  const results = [];
  for (const userId of userIds) {
    try {
      const result = await reconcileResourceLocks(userId, queryable);
      if (result.locked.length > 0 || result.unlocked.length > 0) {
        results.push({ userId, ...result });
      }
    } catch (err) {
      console.error(`[TopupLock] reconcile failed for user ${userId}:`, err.message);
    }
  }
  return results;
}

/**
 * B4: list lock status + ceilings per resource key.
 */
export async function getLockOverview(userId, queryable = db) {
  const overview = {};
  for (const resourceKey of LOCKABLE_RESOURCE_KEYS) {
    const [items, effectiveCeiling, planCeiling, grants] = await Promise.all([
      listResourcesWithLockStatus(userId, resourceKey, queryable),
      resolveEffectiveCeiling(userId, resourceKey, queryable),
      PLAN_CEILING[resourceKey](userId, queryable),
      sumActiveTopupGrants(userId, resourceKey, queryable),
    ]);
    overview[resourceKey] = {
      items,
      effectiveCeiling,
      planCeiling: Math.max(0, planCeiling),
      activeGrants: Math.max(0, Number(grants) || 0),
    };
  }
  return overview;
}

/**
 * B4: customer picks which ids to keep unlocked.
 * keepIds.length must be <= effectiveCeiling.
 */
export async function setKeptResources(userId, resourceKey, keepIds, queryable = db) {
  if (!LOCKABLE_RESOURCE_KEYS.includes(resourceKey)) {
    const err = new Error(`resourceKey không hợp lệ: ${resourceKey}`);
    err.status = 400;
    err.code = 'INVALID_RESOURCE_KEY';
    throw err;
  }

  const effective = await resolveEffectiveCeiling(userId, resourceKey, queryable);
  const ids = Array.isArray(keepIds) ? keepIds.map(Number).filter((n) => Number.isFinite(n)) : [];
  if (ids.length > effective) {
    const err = new Error(
      `Chỉ được giữ tối đa ${effective} tài nguyên (trần hiệu dụng = gói + mua thêm còn hạn).`
    );
    err.status = 400;
    err.code = 'KEEP_EXCEEDS_CEILING';
    err.effectiveCeiling = effective;
    throw err;
  }

  // Validate ownership: only keep ids that belong to this user
  const owned = await listResourcesWithLockStatus(userId, resourceKey, queryable);
  const ownedIds = new Set(owned.map((r) => r.id));
  for (const id of ids) {
    if (!ownedIds.has(id)) {
      const err = new Error(`Tài nguyên ${id} không thuộc tài khoản này`);
      err.status = 400;
      err.code = 'RESOURCE_NOT_OWNED';
      throw err;
    }
  }

  const client = queryable;
  const useTx = !queryable || queryable === db;
  if (useTx) {
    const tx = await db.getClient();
    try {
      await tx.query('BEGIN');
      await replaceLocksForUser(userId, resourceKey, ids, [...ownedIds], tx);
      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      tx.release();
    }
  } else {
    await replaceLocksForUser(userId, resourceKey, ids, [...ownedIds], client);
  }

  return getLockOverview(userId);
}

/**
 * B5: send expiry reminders for structural grants (7d / 3d).
 */
export async function sendStructuralGrantReminders() {
  const { sendSystemEmail } = await import('../../utils/systemEmail.util.js');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
  const locksUrl = `${frontendUrl}/app/billing?tab=locks`;

  // Reminder round 1: ~7 days left (reminder_count < 1), window (6,7]
  const week = await findExpiringStructuralGrants(6, 7, 1);
  for (const grant of week) {
    const daysLeft = Math.ceil((new Date(grant.cycle_end) - Date.now()) / 86400000);
    const itemLabel = structuralItemLabelVi(grant.item_key);
    const subject = `[Founder AI] Slot mua thêm sắp hết hạn (${daysLeft} ngày)`;
    const html = `
      <p>Xin chào ${grant.full_name || 'bạn'},</p>
      <p>${grant.qty} × <strong>${itemLabel}</strong> mua thêm sẽ hết hạn
         vào <strong>${new Date(grant.cycle_end).toLocaleString('vi-VN')}</strong>.</p>
      <p>Gia hạn tại: <a href="${frontendUrl}/app/topup">${frontendUrl}/app/topup</a></p>
      <p>Chọn tài nguyên giữ lại: <a href="${locksUrl}">${locksUrl}</a></p>
    `;
    try {
      await sendSystemEmail({ to: grant.email, subject, html });
      await incrementGrantReminderCount(grant.id);
    } catch (err) {
      console.error(`[TopupLock] reminder 7d failed grant=${grant.id}:`, err.message);
    }
  }

  // Reminder round 2: ~3 days (reminder_count < 2), window (2,3]
  const three = await findExpiringStructuralGrants(2, 3, 2);
  for (const grant of three) {
    const daysLeft = Math.ceil((new Date(grant.cycle_end) - Date.now()) / 86400000);
    const itemLabel = structuralItemLabelVi(grant.item_key);
    const subject = `[Founder AI] Còn ${daysLeft} ngày — slot mua thêm sắp bị khoá`;
    const html = `
      <p>Xin chào ${grant.full_name || 'bạn'},</p>
      <p>${grant.qty} × <strong>${itemLabel}</strong> sẽ hết hạn
         <strong>${new Date(grant.cycle_end).toLocaleString('vi-VN')}</strong>.</p>
      <p><a href="${frontendUrl}/app/topup">Gia hạn ngay</a> ·
         <a href="${locksUrl}">Chọn tài nguyên giữ lại</a></p>
    `;
    try {
      await sendSystemEmail({ to: grant.email, subject, html });
      await incrementGrantReminderCount(grant.id);
    } catch (err) {
      console.error(`[TopupLock] reminder 3d failed grant=${grant.id}:`, err.message);
    }
  }

  return { week: week.length, three: three.length };
}

/** Convenience re-exports used by callers that already imported the service. */
export const checkLocked = repoIsLocked;
export const filterUnlocked = repoFilterLocked;
