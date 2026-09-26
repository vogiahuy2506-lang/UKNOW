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

/**
 * Chuẩn hoá một giá trị trần đọc thẳng từ cột DB (`plans.max_*` hoặc `users.max_*` đã copy từ
 * plan) thành số tài nguyên tối đa. PR-3, Việc 3.2 — trước đây mọi nơi dùng `Number(x) || 0`, nên
 * `NULL` (gói Enterprise: max_zalo_accounts/max_email_accounts/max_chatbots không giới hạn) và
 * `-1` (gói Tùy chọn: max_employees = -1 nghĩa là không giới hạn, xem prod-plans.json) đều rơi về
 * `0` — bị hiểu thành "cấm hoàn toàn" thay vì "không giới hạn", nên bất kỳ khách nào của các gói
 * này có ít nhất 1 tài nguyên đang dùng sẽ bị khoá nhầm ngay lần reconcile kế tiếp.
 *
 * CHỈ gọi hàm này với giá trị lấy từ một HÀNG ĐÃ XÁC NHẬN TỒN TẠI (gói hoặc user có thật) — "không
 * có gói nào cả" (hết hạn) phải được xử lý RIÊNG thành 0 tại nơi gọi, KHÔNG được đưa `undefined`
 * vào đây rồi để nó thành Infinity (sẽ mở khoá nhầm cho khách đã hết hạn thật).
 *
 * @param {number|null|undefined} raw
 * @returns {number} số nguyên ≥ 0, hoặc `Infinity` nếu cột đó nghĩa là không giới hạn
 */
export function normalizeCeiling(raw) {
  if (raw === null) return Infinity; // cột NULL trong DB = "không giới hạn" theo quy ước gói
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0; // giá trị hỏng/không đọc được -> khoá an toàn, không mở nhầm
  if (n === -1) return Infinity; // quy ước riêng của max_employees (gói Tùy chọn)
  return Math.max(0, n);
}

const PLAN_CEILING = Object.freeze({
  zalo_accounts: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_zalo_accounts FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return normalizeCeiling(rows[0]?.max_zalo_accounts);
  },
  email_accounts: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_email_accounts FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return normalizeCeiling(rows[0]?.max_email_accounts);
  },
  landing_pages: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_landing_pages FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return normalizeCeiling(rows[0]?.max_landing_pages);
  },
  chatbots: async (userId, queryable) => {
    const plan = await getPlanByUserId(userId, queryable);
    if (!plan) return 0; // không có gói hiệu lực (đã hết hạn) -> khoá hết, không phải không giới hạn
    return normalizeCeiling(plan.max_chatbots);
  },
  employees: async (userId, queryable) => {
    // PR-3, Việc 3.2 — ĐỔI nguồn đọc: users.max_employees không bao giờ được ghi (không route nào
    // set cột này khi activateUserPlan/assignPlanToUser), luôn NULL nên trần nhân viên trước đây
    // luôn ra 0 → mọi chủ có ≥1 nhân viên bị khoá nhầm ngay khi có BẤT KỲ lý do nào khác kéo họ vào
    // reconcile (vd 1 slot landing mua thêm hết hạn). Nguồn đúng, nhất quán với nơi thật sự chặn
    // tạo nhân viên (`employee.repository.js` đọc `plans.max_employees` qua join), là plan hiện có.
    const plan = await getPlanByUserId(userId, queryable);
    if (!plan) return 0;
    return normalizeCeiling(plan.max_employees);
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
 * Bidirectional reconcile: lock excess oldest-first; unlock most-recently-locked first.
 * Must pass transaction `client` when called from webhook fulfillTopupOrder.
 *
 * @param {number|string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @param {{ unlockOnly?: boolean }} [options] — payment paths set unlockOnly=true (never lock on pay)
 * @returns {Promise<{ locked: Array<{resourceKey:string, resourceId:number}>, unlocked: Array<{resourceKey:string, resourceId:number}>, isGraceActive?: boolean, graceUntil?: Date|null }>}
 */
export async function reconcileResourceLocks(userId, queryable = db, { unlockOnly = false } = {}) {
  const locked = [];
  const unlocked = [];

  const { rows: userRows } = await queryable.query(
    `SELECT overage_grace_until FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const graceUntil = userRows[0]?.overage_grace_until ? new Date(userRows[0].overage_grace_until) : null;
  const isGraceActive = graceUntil && graceUntil.getTime() > Date.now();
  const shouldLock = !unlockOnly && !isGraceActive;

  for (const resourceKey of LOCKABLE_RESOURCE_KEYS) {
    await deleteOrphanLocks(userId, resourceKey, queryable);

    const effective = await resolveEffectiveCeiling(userId, resourceKey, queryable);
    const inUse = await countResourcesInUse(userId, resourceKey, queryable);
    const lockedCount = await countValidLocks(userId, resourceKey, queryable);
    const running = inUse - lockedCount;

    if (shouldLock && running > effective) {
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

  return { locked, unlocked, isGraceActive: Boolean(isGraceActive), graceUntil };
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
  const { rows: userRows } = await queryable.query(
    `SELECT overage_grace_until FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const graceUntil = userRows[0]?.overage_grace_until ? new Date(userRows[0].overage_grace_until) : null;
  const isGraceActive = graceUntil && graceUntil.getTime() > Date.now();

  const overview = {};
  for (const resourceKey of LOCKABLE_RESOURCE_KEYS) {
    const [items, effectiveCeiling, planCeiling, grants] = await Promise.all([
      listResourcesWithLockStatus(userId, resourceKey, queryable),
      resolveEffectiveCeiling(userId, resourceKey, queryable),
      PLAN_CEILING[resourceKey](userId, queryable),
      sumActiveTopupGrants(userId, resourceKey, queryable),
    ]);
    // "Nợ nhỏ" 26/09 — Infinity (tài nguyên không giới hạn) qua JSON.stringify() ngầm định thành
    // null, nhưng đây là hệ quả PHỤ của một quirk serialize, không phải hợp đồng rõ ràng: đọc trực
    // tiếp object này TRƯỚC khi qua res.json() (vd trong test) vẫn thấy Infinity, không phải null.
    // Ép null tường minh ở đây để FE (ResourceLocksTab.jsx) và mọi test đều thấy CÙNG MỘT giá trị.
    overview[resourceKey] = {
      items,
      effectiveCeiling: Number.isFinite(effectiveCeiling) ? effectiveCeiling : null,
      planCeiling: Number.isFinite(planCeiling) ? Math.max(0, planCeiling) : null,
      activeGrants: Math.max(0, Number(grants) || 0),
    };
  }
  return {
    ...overview,
    overageGraceUntil: graceUntil,
    isGraceActive: Boolean(isGraceActive),
  };
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
