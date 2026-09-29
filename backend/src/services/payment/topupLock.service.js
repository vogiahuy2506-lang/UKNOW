import db from '../../config/database.js';
import { getPlanByUserId } from '../../repositories/payment/plan.repository.js';
import { sumActiveTopupGrants, findExpiringUnrenewedGrants } from '../../repositories/payment/topup.repository.js';
import { escapeHtml } from '../../utils/htmlEscape.util.js';
import { formatVnDateTime } from '../../utils/vnTimeFormat.util.js';
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
  findUsersWithEndedOverageGrace,
  findUsersEligibleForOverageGrace,
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
  // P6 — trần theo users.max_* (đồng bộ từ plans.* khi kích hoạt gói, migration 263); NULL = không giới hạn
  // (gói hiện có không đổi hành vi), 0 = gói không hỗ trợ kênh (hết hạn gói cũng ghi 0 — subscription.repository).
  telegram_accounts: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_telegram_accounts FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return normalizeCeiling(rows[0]?.max_telegram_accounts);
  },
  whatsapp_accounts: async (userId, queryable) => {
    const { rows } = await queryable.query(
      `SELECT max_whatsapp_accounts FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    return normalizeCeiling(rows[0]?.max_whatsapp_accounts);
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
  telegram_accounts: 'tài khoản Telegram',
  whatsapp_accounts: 'tài khoản WhatsApp',
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
 * Bidirectional reconcile: lock excess newest-added-first; unlock most-recently-locked first.
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
 * Tính phần vượt hạn mức hiện tại của user, CHỈ ĐỌC — không khoá/mở khoá gì (khác
 * `reconcileResourceLocks`, dùng lại đúng công thức: `running = countResourcesInUse -
 * countValidLocks`, `over = running - resolveEffectiveCeiling`). Dùng để báo trước cho khách lúc
 * kích hoạt lệnh hẹn hạ gói — tại thời điểm đó KHÔNG được khoá ngay (ân hạn 7 ngày là chủ đích),
 * nên không thể gọi `reconcileResourceLocks` rồi đọc `locked` ra.
 *
 * @param {number|string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<Array<{resourceKey: string, over: number}>>} chỉ các resourceKey có over > 0
 */
export async function computeOverage(userId, queryable = db) {
  const overages = [];
  for (const resourceKey of LOCKABLE_RESOURCE_KEYS) {
    const effective = await resolveEffectiveCeiling(userId, resourceKey, queryable);
    const inUse = await countResourcesInUse(userId, resourceKey, queryable);
    const lockedCount = await countValidLocks(userId, resourceKey, queryable);
    const running = inUse - lockedCount;
    const over = running - effective;
    if (over > 0) {
      overages.push({ resourceKey, over });
    }
  }
  return overages;
}

/**
 * Cron entry: user hết hạn gói + user có grant cấu trúc vừa hết hạn + user đang bị khoá +
 * user đã hết 7 ngày ân hạn hạ gói.
 *
 * Tập thứ ba là lưới an toàn cho chiều mở khoá — xem `findUsersWithLocks`. Tập thứ tư là lưới an
 * toàn cho chiều KHOÁ khi hạ gói: `scheduledPlanChange.service.js` chỉ đặt ân hạn 7 ngày + mở khoá
 * (không khoá ngay, đúng chủ đích), nên phải có tập này thì hết ân hạn mới thật sự bị khoá phần
 * vượt — xem `findUsersWithEndedOverageGrace`.
 */
export async function reconcileAllDueUsers(queryable = db) {
  const { findExpiredUsers } = await import('../../repositories/subscription/subscription.repository.js');
  const expiredPlan = await findExpiredUsers();
  const expiredGrants = await findUsersWithExpiredStructuralGrants(7, queryable);
  const locked = await findUsersWithLocks(queryable);
  const endedGrace = await findUsersWithEndedOverageGrace(queryable);

  const userIds = new Set([
    ...expiredPlan.map((u) => Number(u.id)),
    ...expiredGrants.map((u) => Number(u.id)),
    ...locked.map((u) => Number(u.id)),
    ...endedGrace.map((u) => Number(u.id)),
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
 * Nội dung thư báo lúc tài nguyên bị khoá — câu trung tính vì bảng `topup_locked_resources` không
 * lưu lý do khoá (hết hạn slot mua thêm hay hết ân hạn hạ gói), và một user có thể thuộc nhiều tập
 * cùng lúc. `full_name` escape trước khi chèn HTML (cột người dùng tự đặt lúc đăng ký).
 *
 * @param {{ fullName?: string|null, locked: Array<{resourceKey: string, resourceId: number}>, frontendUrl: string }} params
 * @returns {{ subject: string, html: string }}
 */
export function buildLockNoticeEmail({ fullName, locked, frontendUrl }) {
  const name = escapeHtml(fullName || 'bạn');
  const counts = (locked || []).reduce((acc, x) => {
    acc[x.resourceKey] = (acc[x.resourceKey] || 0) + 1;
    return acc;
  }, {});
  const detail = Object.entries(counts)
    .map(([key, n]) => `${n} ${structuralItemLabelVi(key)}`)
    .join(', ');
  const locksUrl = `${frontendUrl}/app/billing?tab=locks`;
  const topupUrl = `${frontendUrl}/app/topup`;

  return {
    subject: '[Founder AI] Một số tài nguyên đã bị tạm khoá do vượt hạn mức',
    html: `
      <p>Xin chào ${name},</p>
      <p>Tài khoản của bạn đang dùng nhiều hơn hạn mức hiện có (gói hiện tại cộng phần mua thêm còn
         hạn), nên hệ thống đã tạm khoá: <strong>${detail}</strong>. Dữ liệu vẫn được giữ nguyên.</p>
      <p>Bạn có thể chọn giữ lại cái nào tại <a href="${locksUrl}">Tài nguyên bị khoá</a>, hoặc
         <a href="${topupUrl}">mua thêm</a> để mở khoá ngay.</p>
    `,
  };
}

/**
 * Gửi thư báo khoá cho mọi user trong `results` (kết quả của `reconcileAllDueUsers`) thật sự có
 * tài nguyên vừa bị khoá. Mỗi user một try/catch riêng — một user lỗi (email hỏng, thiếu user)
 * không chặn thư của user khác.
 *
 * @param {Array<{userId: number, locked: Array<{resourceKey: string, resourceId: number}>}>} results
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<number>} số thư gửi thành công
 */
export async function sendLockNotices(results, queryable = db) {
  const { sendSystemEmail } = await import('../../utils/systemEmail.util.js');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
  let sentCount = 0;

  for (const r of results) {
    if (!r.locked?.length) continue;
    try {
      const { rows } = await queryable.query(
        `SELECT email, full_name FROM users WHERE id = $1`,
        [r.userId]
      );
      const u = rows[0];
      if (!u?.email) continue;

      const { subject, html } = buildLockNoticeEmail({ fullName: u.full_name, locked: r.locked, frontendUrl });
      await sendSystemEmail({ to: u.email, subject, html });
      sentCount += 1;
    } catch (err) {
      console.error(`[TopupLock] lock notify email failed for user ${r.userId}:`, err.message);
    }
  }

  return sentCount;
}

/**
 * PR-2 (mục 7.1 Việc B) — đoạn HTML dùng CHUNG cho hai thư khi khách đang/sắp vượt hạn mức mà còn
 * 7 ngày ân hạn: thư kích hoạt lệnh hẹn hạ gói (`scheduledPlanChange.service.js`, PR-1) và thư
 * Việc A (`startGraceForUnlockedOverage`, mọi đường KHÁC làm trần giảm mà không qua lệnh hẹn — nâng
 * gói Tuỳ chọn giảm một món, super admin gán gói thấp hơn, tạo gói riêng thấp hơn, sửa giảm hạn mức
 * gói). Câu mở đổi "Gói mới cho phép" -> "Hạn mức hiện tại cho phép" để đúng nghĩa ở cả hai ngữ
 * cảnh — nội dung còn lại giữ nguyên như PR-1.
 *
 * @param {{ overages: Array<{resourceKey: string, over: number}>, graceUntil: Date|string, frontendUrl: string }} params
 * @returns {string} đoạn `<p>...</p>` HTML, rỗng nếu `overages` rỗng
 */
export function buildOverageGraceNotice({ overages, graceUntil, frontendUrl }) {
  if (!overages || overages.length === 0) return '';
  const detail = overages.map((o) => `${o.over} ${structuralItemLabelVi(o.resourceKey)}`).join(', ');
  const deadlineStr = formatVnDateTime(graceUntil);
  return `<p>Hạn mức hiện tại cho phép ít tài nguyên hơn bạn đang dùng: vượt <strong>${detail}</strong>. `
    + `Bạn có 7 ngày, tới <strong>${deadlineStr}</strong>, để chọn giữ lại cái nào `
    + `(<a href="${frontendUrl}/app/billing?tab=locks">chọn tài nguyên giữ lại</a>) hoặc `
    + `<a href="${frontendUrl}/app/topup">mua thêm</a>. Sau hạn này hệ thống tự khoá phần vượt, `
    + `cái tạo gần nhất bị khoá trước.</p>`;
}

/**
 * PR-2 (mục 7.1 Việc A) — quét MỌI đường làm trần giảm mà không đi qua lệnh hẹn hạ gói (nên không
 * tự có `overage_grace_until`), cấp 7 ngày ân hạn đúng như hạ gói theo lệnh hẹn, thay vì khoá ngay.
 * PHẢI chạy SAU `reconcileAllDueUsers` + `sendLockNotices` trong cùng lượt cron (xem scheduler.js):
 * lúc đó slot mua lẻ hết hạn (tập 2 của reconcileAllDueUsers) đã bị khoá xong nên `computeOverage`
 * của người đó ra 0 — mua lẻ hết hạn KHÔNG được ân hạn, giữ đúng luật cũ.
 *
 * Điều kiện `overage_grace_until IS NULL` xuất hiện ở CẢ ứng viên
 * (`findUsersEligibleForOverageGrace`) LẪN UPDATE bên dưới — chống hai lượt cron chạy chồng ghi đè
 * lẫn nhau (UPDATE có điều kiện là chốt chặn cuối cùng, không chỉ dựa vào danh sách ứng viên đọc
 * trước đó).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<{ graceStarted: number, emailed: number }>}
 */
export async function startGraceForUnlockedOverage(queryable = db) {
  const { sendSystemEmail } = await import('../../utils/systemEmail.util.js');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
  const candidates = await findUsersEligibleForOverageGrace(queryable);

  let graceStarted = 0;
  let emailed = 0;

  for (const candidate of candidates) {
    const userId = Number(candidate.id);
    try {
      const overages = await computeOverage(userId, queryable);
      if (overages.length === 0) continue;

      const { rows } = await queryable.query(
        `UPDATE users SET overage_grace_until = NOW() + INTERVAL '7 days'
           WHERE id = $1 AND overage_grace_until IS NULL
         RETURNING overage_grace_until, email, full_name`,
        [userId]
      );
      if (rows.length === 0) continue; // lượt cron khác đã đặt ân hạn trước — chống chạy chồng
      graceStarted += 1;

      const u = rows[0];
      if (!u.email) continue;

      const notice = buildOverageGraceNotice({ overages, graceUntil: u.overage_grace_until, frontendUrl });
      const name = escapeHtml(u.full_name || 'bạn');
      await sendSystemEmail({
        to: u.email,
        subject: '[Founder AI] Tài khoản đang dùng vượt hạn mức gói hiện tại',
        html: `<p>Xin chào ${name},</p>
<p>Hạn mức hiện tại của tài khoản (gói cộng phần mua thêm còn hạn) thấp hơn số bạn đang dùng.</p>
${notice}`,
      });
      emailed += 1;
    } catch (err) {
      console.error(`[TopupLock] startGraceForUnlockedOverage failed for user ${candidate.id}:`, err.message);
    }
  }

  return { graceStarted, emailed };
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
 * Nội dung thư nhắc hết hạn cho một grant, theo lượt ('week' ~7 ngày / 'three' ~3 ngày).
 * storage_gb dùng câu chữ riêng (không có link "Chọn tài nguyên giữ lại" — dung lượng không phải
 * danh sách rời rạc để chọn giữ/khoá), giống nhau ở cả hai lượt. Các món khác giữ nguyên câu chữ
 * cũ theo từng lượt. `full_name` được escape trước khi chèn vào HTML — cột này do người dùng tự
 * đặt lúc đăng ký, chèn thẳng vào email trước đây là lỗ hổng HTML injection.
 */
function buildStructuralReminderEmail(grant, daysLeft, frontendUrl, locksUrl, round) {
  const fullName = escapeHtml(grant.full_name || 'bạn');
  const cycleEndStr = new Date(grant.cycle_end).toLocaleString('vi-VN');

  if (grant.item_key === 'storage_gb') {
    return {
      subject: `[Founder AI] Dung lượng mua thêm sắp hết hạn (${daysLeft} ngày)`,
      html: `
        <p>Xin chào ${fullName},</p>
        <p>${grant.qty} GB dung lượng lưu trữ mua thêm sẽ hết hạn vào <strong>${cycleEndStr}</strong>.
           Sau khi hết hạn, dung lượng trở về mức của gói; tệp đã lưu vẫn giữ nguyên, nhưng nếu bạn
           đang dùng vượt mức gói thì sẽ không tải thêm tệp mới được cho tới khi xoá bớt hoặc mua
           thêm.</p>
        <p>Gia hạn tại: <a href="${frontendUrl}/app/topup">${frontendUrl}/app/topup</a></p>
      `,
    };
  }

  const itemLabel = structuralItemLabelVi(grant.item_key);
  if (round === 'week') {
    return {
      subject: `[Founder AI] Slot mua thêm sắp hết hạn (${daysLeft} ngày)`,
      html: `
        <p>Xin chào ${fullName},</p>
        <p>${grant.qty} × <strong>${itemLabel}</strong> mua thêm sẽ hết hạn
           vào <strong>${cycleEndStr}</strong>.</p>
        <p>Gia hạn tại: <a href="${frontendUrl}/app/topup">${frontendUrl}/app/topup</a></p>
        <p>Chọn tài nguyên giữ lại: <a href="${locksUrl}">${locksUrl}</a></p>
      `,
    };
  }
  return {
    subject: `[Founder AI] Còn ${daysLeft} ngày — slot mua thêm sắp bị khoá`,
    html: `
      <p>Xin chào ${fullName},</p>
      <p>${grant.qty} × <strong>${itemLabel}</strong> sẽ hết hạn
         <strong>${cycleEndStr}</strong>.</p>
      <p><a href="${frontendUrl}/app/topup">Gia hạn ngay</a> ·
         <a href="${locksUrl}">Chọn tài nguyên giữ lại</a></p>
    `,
  };
}

/**
 * B5: send expiry reminders for structural grants (7d / 3d).
 */
export async function sendStructuralGrantReminders() {
  const { sendSystemEmail } = await import('../../utils/systemEmail.util.js');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
  const locksUrl = `${frontendUrl}/app/billing?tab=locks`;

  // Bỏ qua nhắc cho item_key đã được gia hạn đủ (banner trong app đã có luật này —
  // findExpiringUnrenewedGrants, dùng lại nguyên luật đó cho email, không viết luật thứ hai).
  // Cache theo user_id trong MỘT LƯỢT CHẠY: một khách nhiều grant chỉ truy vấn một lần. Lỗi truy
  // vấn cũng được cache là `null` ("không xác định được") để một khách lỗi không bị hỏi lại nhiều
  // lần trong cùng lượt — `null` nghĩa là gửi như cũ (thà nhắc thừa còn hơn bỏ sót).
  const unrenewedItemKeysByUser = new Map();
  async function getUnrenewedItemKeys(userId) {
    if (unrenewedItemKeysByUser.has(userId)) return unrenewedItemKeysByUser.get(userId);
    let itemKeys;
    try {
      const rows = await findExpiringUnrenewedGrants(userId);
      itemKeys = new Set(rows.map((r) => r.itemKey));
    } catch (err) {
      console.error(`[TopupLock] findExpiringUnrenewedGrants failed user=${userId}:`, err.message);
      itemKeys = null;
    }
    unrenewedItemKeysByUser.set(userId, itemKeys);
    return itemKeys;
  }

  // Reminder round 1: ~7 days left (reminder_count < 1), window (6,7]
  const week = await findExpiringStructuralGrants(6, 7, 1);
  for (const grant of week) {
    const unrenewedItemKeys = await getUnrenewedItemKeys(grant.user_id);
    if (unrenewedItemKeys && !unrenewedItemKeys.has(grant.item_key)) {
      console.log(`[TopupLock] reminder 7d skip grant=${grant.id} user=${grant.user_id} item=${grant.item_key}: da gia han du, khong con can nhac`);
      continue;
    }
    const daysLeft = Math.ceil((new Date(grant.cycle_end) - Date.now()) / 86400000);
    const { subject, html } = buildStructuralReminderEmail(grant, daysLeft, frontendUrl, locksUrl, 'week');
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
    const unrenewedItemKeys = await getUnrenewedItemKeys(grant.user_id);
    if (unrenewedItemKeys && !unrenewedItemKeys.has(grant.item_key)) {
      console.log(`[TopupLock] reminder 3d skip grant=${grant.id} user=${grant.user_id} item=${grant.item_key}: da gia han du, khong con can nhac`);
      continue;
    }
    const daysLeft = Math.ceil((new Date(grant.cycle_end) - Date.now()) / 86400000);
    const { subject, html } = buildStructuralReminderEmail(grant, daysLeft, frontendUrl, locksUrl, 'three');
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
