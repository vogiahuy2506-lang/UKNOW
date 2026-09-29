import db from '../../config/database.js';

/** Resource keys in scope for resource locking. */
export const LOCKABLE_RESOURCE_KEYS = Object.freeze([
  'zalo_accounts',
  'email_accounts',
  'landing_pages',
  'chatbots',
  'employees',
  // P6 (PLAN_TG_WA_DAY_DU) — tài khoản kênh Telegram/WhatsApp: hạ gói / slot mua thêm hết hạn thì khoá bớt.
  'telegram_accounts',
  'whatsapp_accounts',
]);

/**
 * Item keys eligible for expiry reminders (findExpiringStructuralGrants) — LOCKABLE_RESOURCE_KEYS
 * cộng 'storage_gb'. Dung lượng lưu trữ cũng là structural (có cycle_end, xem
 * TOPUP_STRUCTURAL_KEYS trong topupPricing.util.js) nhưng KHÔNG khoá qua topup_locked_resources
 * (không phải danh sách rời rạc để chọn giữ/khoá từng cái) — nên nằm ngoài LOCKABLE_RESOURCE_KEYS,
 * dù vẫn cần nhắc trước khi hết hạn như các món khác.
 */
export const REMINDER_ITEM_KEYS = Object.freeze([...LOCKABLE_RESOURCE_KEYS, 'storage_gb']);

/**
 * WhatsApp KHÔNG có bảng tài khoản với id số: phiên sống ở `whatsapp_baileys_session_creds` (khoá session_key
 * TEXT) còn `topup_locked_resources.resource_id` là BIGINT. P6 dùng `whatsapp_account_settings.id` (migration 268,
 * BIGSERIAL UNIQUE) làm id khoá. Nguồn "tài nguyên còn sống" = settings JOIN creds: phiên đã xoá (creds mất) thì
 * dòng settings còn sót không được đếm/không giữ khoá (mục "xoá phiên WA không dọn dòng settings" của P4).
 * Dạng subquery để mọi câu `FROM ${table} r WHERE r.id_user = … / r.id = …` bên dưới dùng lại nguyên văn.
 */
const WHATSAPP_LIVE_SOURCE = `(
  SELECT s.id, s.id_user, s.session_key
  FROM whatsapp_account_settings s
  JOIN whatsapp_baileys_session_creds c ON c.session_key = s.session_key
)`;

const RESOURCE_TABLE = Object.freeze({
  zalo_accounts: 'zalo_settings',
  email_accounts: 'email_settings',
  landing_pages: 'landing_pages',
  chatbots: 'custom_chatbots',
  employees: 'user_members',
  telegram_accounts: 'telegram_accounts',
  whatsapp_accounts: WHATSAPP_LIVE_SOURCE,
});

/**
 * Bảo đảm MỌI phiên WhatsApp của chủ có dòng `whatsapp_account_settings` (có id để khoá). Phiên cũ (trước P6) và
 * phiên chưa từng đặt tốc độ gửi chưa có dòng. Idempotent. Không chạm dữ liệu của phiên đã có dòng.
 * @param {number|string} userId chủ workspace (tiền tố của session_key)
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function ensureWhatsappSettingsRows(userId, queryable = db) {
  await queryable.query(
    `INSERT INTO whatsapp_account_settings (session_key, id_user)
     SELECT c.session_key, $1::bigint
     FROM whatsapp_baileys_session_creds c
     WHERE split_part(c.session_key, '-', 1) = ($1::bigint)::text
     ORDER BY c.updated_at ASC
     ON CONFLICT (session_key) DO NOTHING`,
    [userId]
  );
}

/**
 * Tạo dòng settings cho MỘT phiên vừa mở (gọi ngay lúc kết nối) để id phản ánh đúng thứ tự "thêm sau cùng" — id
 * lớn = mới hơn = khoá trước. Best-effort ở nơi gọi.
 * @param {number|string} userId
 * @param {string} sessionKey
 */
export async function ensureWhatsappSettingsRow(userId, sessionKey, queryable = db) {
  await queryable.query(
    `INSERT INTO whatsapp_account_settings (session_key, id_user)
     VALUES ($1, $2)
     ON CONFLICT (session_key) DO NOTHING`,
    [String(sessionKey), userId]
  );
}

/**
 * Phiên WhatsApp `sessionKey` có đang bị khoá không (tra id settings → topup_locked_resources).
 * Không có dòng settings = chưa từng bị khoá (khoá luôn tạo dòng trước).
 * @param {string} sessionKey
 */
export async function isWhatsappSessionLocked(sessionKey, queryable = db) {
  if (!sessionKey) return false;
  const { rows } = await queryable.query(
    `SELECT 1
     FROM whatsapp_account_settings s
     JOIN topup_locked_resources t
       ON t.resource_key = 'whatsapp_accounts' AND t.resource_id = s.id
     WHERE s.session_key = $1
     LIMIT 1`,
    [String(sessionKey)]
  );
  return rows.length > 0;
}

/**
 * @param {string} resourceKey
 * @param {number|string} resourceId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function isResourceLocked(resourceKey, resourceId, queryable = db) {
  if (resourceId == null || resourceId === '') return false;
  const { rows } = await queryable.query(
    `SELECT 1 FROM topup_locked_resources
     WHERE resource_key = $1 AND resource_id = $2
     LIMIT 1`,
    [resourceKey, resourceId]
  );
  return rows.length > 0;
}

/**
 * @param {string} resourceKey
 * @param {Array<number|string>} ids
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<Array<number|string>>} ids that are NOT locked
 */
export async function filterLockedResources(resourceKey, ids, queryable = db) {
  const list = (ids || []).filter((id) => id != null && id !== '');
  if (list.length === 0) return [];
  const { rows } = await queryable.query(
    `SELECT resource_id
     FROM topup_locked_resources
     WHERE resource_key = $1 AND resource_id = ANY($2::bigint[])`,
    [resourceKey, list.map(Number)]
  );
  const locked = new Set(rows.map((r) => Number(r.resource_id)));
  return list.filter((id) => !locked.has(Number(id)));
}

/**
 * Delete lock rows whose target resource no longer exists.
 * @param {number|string} userId
 * @param {string} resourceKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function deleteOrphanLocks(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return 0;

  let deleteSql;
  if (resourceKey === 'employees') {
    deleteSql = `DELETE FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = 'employees'
       AND NOT EXISTS (
         SELECT 1 FROM user_members r WHERE r.id = tlr.resource_id AND r.status = 'active'
       )`;
  } else {
    deleteSql = `DELETE FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = $2
       AND NOT EXISTS (
         SELECT 1 FROM ${table} r WHERE r.id = tlr.resource_id
       )`;
  }
  const params = resourceKey === 'employees' ? [userId] : [userId, resourceKey];
  const { rowCount } = await queryable.query(deleteSql, params);
  return rowCount || 0;
}

/**
 * Count lock rows that still JOIN to the target table.
 */
export async function countValidLocks(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return 0;

  let countSql;
  if (resourceKey === 'employees') {
    countSql = `SELECT COUNT(*)::int AS total
     FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = 'employees'
       AND EXISTS (
         SELECT 1 FROM user_members r WHERE r.id = tlr.resource_id AND r.status = 'active'
       )`;
  } else {
    countSql = `SELECT COUNT(*)::int AS total
     FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = $2
       AND EXISTS (
         SELECT 1 FROM ${table} r WHERE r.id = tlr.resource_id
       )`;
  }
  const params = resourceKey === 'employees' ? [userId] : [userId, resourceKey];
  const { rows } = await queryable.query(countSql, params);
  return Number(rows[0]?.total) || 0;
}

/**
 * List unlocked resource ids NEWEST-added-first (for locking).
 * Chatbots: only is_active = true. Others: all active rows.
 *
 * Khoá tài nguyên THÊM VÀO GẦN NHẤT trước (không phải cũ nhất): khách mua slot để thêm một
 * tài nguyên mới, slot hết hạn thì đúng ra phải mất lại đúng tài nguyên mới đó trước, không phải
 * mất tài nguyên họ có sẵn từ đầu. Hạ gói cũng vậy — hạ từ Pro xuống Basic thì giữ lại những cái
 * có từ trước, khoá bớt những cái thêm vào sau cùng.
 */
export async function listUnlockedResourceIds(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return [];
  if (resourceKey === 'whatsapp_accounts') await ensureWhatsappSettingsRows(userId, queryable);

  let sql;
  if (resourceKey === 'chatbots') {
    sql = `
      SELECT r.id
      FROM custom_chatbots r
      WHERE r.id_user = $1
        AND r.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM topup_locked_resources tlr
          WHERE tlr.resource_key = 'chatbots' AND tlr.resource_id = r.id
        )
      ORDER BY r.id DESC`;
  } else if (resourceKey === 'employees') {
    sql = `
      SELECT r.id
      FROM user_members r
      WHERE r.owner_id = $1
        AND r.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM topup_locked_resources tlr
          WHERE tlr.resource_key = 'employees' AND tlr.resource_id = r.id
        )
      ORDER BY r.id DESC`;
  } else {
    sql = `
      SELECT r.id
      FROM ${table} r
      WHERE r.id_user = $1
        AND NOT EXISTS (
          SELECT 1 FROM topup_locked_resources tlr
          WHERE tlr.resource_key = $2 AND tlr.resource_id = r.id
        )
      ORDER BY r.id DESC`;
  }

  const params = (resourceKey === 'chatbots' || resourceKey === 'employees') ? [userId] : [userId, resourceKey];
  const { rows } = await queryable.query(sql, params);
  return rows.map((r) => Number(r.id));
}

/**
 * List locked resource ids newest-lock-first (for unlocking).
 */
export async function listLockedResourceIds(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return [];
  const { rows } = await queryable.query(
    `SELECT tlr.resource_id
     FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = $2
       AND EXISTS (
         SELECT 1 FROM ${table} r WHERE r.id = tlr.resource_id
       )
     ORDER BY tlr.locked_at DESC`,
    [userId, resourceKey]
  );
  return rows.map((r) => Number(r.resource_id));
}

/**
 * @param {number|string} userId
 * @param {string} resourceKey
 * @param {number|string} resourceId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function insertLock(userId, resourceKey, resourceId, queryable = db) {
  await queryable.query(
    `INSERT INTO topup_locked_resources (user_id, resource_key, resource_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (resource_key, resource_id) DO NOTHING`,
    [userId, resourceKey, resourceId]
  );
}

/**
 * @param {string} resourceKey
 * @param {number|string} resourceId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function deleteLock(resourceKey, resourceId, queryable = db) {
  await queryable.query(
    `DELETE FROM topup_locked_resources
     WHERE resource_key = $1 AND resource_id = $2`,
    [resourceKey, resourceId]
  );
}

/**
 * Replace locks for one resource key: keepIds stay unlocked; everything else locked.
 * Caller must validate keepIds.length <= effectiveCeiling.
 */
export async function replaceLocksForUser(userId, resourceKey, keepIds, allIds, queryable = db) {
  const keep = new Set((keepIds || []).map(Number));
  const toLock = (allIds || []).map(Number).filter((id) => !keep.has(id));

  await queryable.query(
    `DELETE FROM topup_locked_resources
     WHERE user_id = $1 AND resource_key = $2`,
    [userId, resourceKey]
  );

  for (const resourceId of toLock) {
    await insertLock(userId, resourceKey, resourceId, queryable);
  }
}

/**
 * Count resources for reconcile — copy create-gate semantics.
 */
export async function countResourcesInUse(userId, resourceKey, queryable = db) {
  if (resourceKey === 'chatbots') {
    const { rows } = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM custom_chatbots
       WHERE id_user = $1 AND is_active = true`,
      [userId]
    );
    return Number(rows[0]?.total) || 0;
  }
  if (resourceKey === 'employees') {
    const { rows } = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM user_members
       WHERE owner_id = $1 AND status = 'active'`,
      [userId]
    );
    return Number(rows[0]?.total) || 0;
  }
  if (resourceKey === 'whatsapp_accounts') {
    // Đếm THẲNG từ nguồn sự thật (creds) — không phụ thuộc dòng settings đã được tạo hay chưa; cùng công thức
    // với cổng tạo phiên (RESOURCE_LIMIT_MAP.whatsappAccounts, userResourceLimit.util.js).
    const { rows } = await queryable.query(
      `SELECT COUNT(*)::int AS total
       FROM whatsapp_baileys_session_creds
       WHERE split_part(session_key, '-', 1) = ($1::bigint)::text`,
      [userId]
    );
    return Number(rows[0]?.total) || 0;
  }
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return 0;
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS total FROM ${table} WHERE id_user = $1`,
    [userId]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * Users with structural grants that expired recently (still may have active plan).
 *
 * Cửa sổ lùi `lookbackDays` để tập user không phình theo lịch sử: grant hết hạn cũ hơn
 * đã được reconcile rồi, và nếu vẫn còn khoá thì user nằm trong `findUsersWithLocks`.
 */
export async function findUsersWithExpiredStructuralGrants(lookbackDays = 7, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT DISTINCT tg.user_id AS id
     FROM topup_grants tg
     WHERE tg.item_key = ANY($1::text[])
       AND tg.cycle_end IS NOT NULL
       AND tg.cycle_end <= NOW()
       AND tg.cycle_end > NOW() - ($2 || ' days')::interval`,
    [LOCKABLE_RESOURCE_KEYS, String(lookbackDays)]
  );
  return rows;
}

/**
 * Users hiện đang có tài nguyên bị khoá.
 *
 * Lưới an toàn cho chiều MỞ khoá: bất kỳ đường nào làm trần tăng trở lại (gia hạn gói,
 * admin nâng gói, khách tự xoá bớt tài nguyên) mà quên gọi reconcile thì cron vẫn tự chữa.
 */
export async function findUsersWithLocks(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT DISTINCT user_id AS id FROM topup_locked_resources`
  );
  return rows;
}

/**
 * Users đã hết 7 ngày ân hạn hạ gói (`scheduledPlanChange.service.js` đặt
 * `overage_grace_until = NOW() + INTERVAL '7 days'` lúc kích hoạt lệnh hẹn hạ gói).
 *
 * KHÔNG có cận dưới (khác `findUsersWithExpiredStructuralGrants`): khách hết ân hạn từ TRƯỚC khi
 * tính năng này lên production vẫn phải được gom vào, không chỉ người hết ân hạn "gần đây". Tập
 * này nhỏ (chỉ người từng có lệnh hẹn hạ gói) nên gom lại mỗi ngày không tốn kém, và
 * `reconcileAllDueUsers` chỉ đẩy vào kết quả khi thật sự có thay đổi khoá/mở khoá.
 */
export async function findUsersWithEndedOverageGrace(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id FROM users WHERE overage_grace_until IS NOT NULL AND overage_grace_until <= NOW()`
  );
  return rows;
}

/**
 * PR-2 (mục 7 plan) — ứng viên cho `startGraceForUnlockedOverage`: user có gói hiệu lực, CHƯA từng
 * được cấp ân hạn (`overage_grace_until IS NULL`). Bắt MỌI đường làm trần giảm mà không khoá (nâng
 * gói Tuỳ chọn giảm một món, super admin gán gói thấp hơn, tạo gói riêng thấp hơn, sửa giảm hạn
 * mức gói) mà không cần biết cụ thể đường nào — `computeOverage` ở nơi gọi tự lọc ra ai thật sự
 * đang vượt. Người đã có ân hạn (`overage_grace_until` khác NULL, kể cả đã hết) KHÔNG vào tập này —
 * hết ân hạn cũ thuộc tập 4 của `reconcileAllDueUsers` (`findUsersWithEndedOverageGrace`), vượt mới
 * sau đó bị khoá luôn, không được cấp ân hạn lần hai (chủ đích).
 */
export async function findUsersEligibleForOverageGrace(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id FROM users WHERE role = 'user' AND active_plan_id IS NOT NULL AND overage_grace_until IS NULL`
  );
  return rows;
}

/**
 * Structural grants expiring within [minDays, maxDays], with reminder_count < threshold.
 */
export async function findExpiringStructuralGrants(minDays, maxDays, reminderThreshold, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT tg.id, tg.user_id, tg.item_key, tg.qty, tg.cycle_end, tg.reminder_count,
            u.email, u.full_name
     FROM topup_grants tg
     JOIN users u ON u.id = tg.user_id
     WHERE tg.item_key = ANY($1::text[])
       AND tg.cycle_end IS NOT NULL
       AND tg.cycle_end > NOW()
       AND tg.cycle_end <= NOW() + ($2 || ' days')::interval
       AND tg.cycle_end > NOW() + ($3 || ' days')::interval
       AND tg.reminder_count < $4
     ORDER BY tg.cycle_end ASC`,
    [REMINDER_ITEM_KEYS, String(maxDays), String(minDays), reminderThreshold]
  );
  return rows;
}

export async function incrementGrantReminderCount(grantId, queryable = db) {
  await queryable.query(
    `UPDATE topup_grants SET reminder_count = reminder_count + 1 WHERE id = $1`,
    [grantId]
  );
}

/**
 * List all resources + lock status for B4 UI.
 */
export async function listResourcesWithLockStatus(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return [];
  if (resourceKey === 'whatsapp_accounts') await ensureWhatsappSettingsRows(userId, queryable);

  let sql;
  if (resourceKey === 'telegram_accounts') {
    sql = `
      SELECT r.id,
             COALESCE(NULLIF(r.username, ''), NULLIF(r.first_name, ''), NULLIF(r.phone, ''), 'Telegram #' || r.id) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM telegram_accounts r
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'telegram_accounts' AND tlr.resource_id = r.id
      WHERE r.id_user = $1
      ORDER BY r.id ASC`;
  } else if (resourceKey === 'whatsapp_accounts') {
    sql = `
      SELECT r.id,
             COALESCE(NULLIF(p.me_name, ''), 'WhatsApp ' || split_part(r.session_key, '-', 2)) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM ${WHATSAPP_LIVE_SOURCE} r
      LEFT JOIN whatsapp_baileys_session_profile p ON p.session_key = r.session_key
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'whatsapp_accounts' AND tlr.resource_id = r.id
      WHERE r.id_user = $1
      ORDER BY r.id ASC`;
  } else if (resourceKey === 'chatbots') {
    sql = `
      SELECT r.id,
             COALESCE(r.name, 'Chatbot #' || r.id) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM custom_chatbots r
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'chatbots' AND tlr.resource_id = r.id
      WHERE r.id_user = $1 AND r.is_active = true
      ORDER BY r.id ASC`;
  } else if (resourceKey === 'employees') {
    sql = `
      SELECT r.id,
             COALESCE(NULLIF(u.full_name, ''), NULLIF(u.email, ''), 'Nhân viên #' || r.id) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM user_members r
      JOIN users u ON u.id = r.employee_id
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'employees' AND tlr.resource_id = r.id
      WHERE r.owner_id = $1 AND r.status = 'active'
      ORDER BY r.id ASC`;
  } else if (resourceKey === 'zalo_accounts') {
    sql = `
      SELECT r.id,
             COALESCE(NULLIF(r.display_name, ''), NULLIF(r.zalo_name, ''), 'Zalo #' || r.id) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM zalo_settings r
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'zalo_accounts' AND tlr.resource_id = r.id
      WHERE r.id_user = $1
      ORDER BY r.id ASC`;
  } else if (resourceKey === 'email_accounts') {
    sql = `
      SELECT r.id,
             COALESCE(NULLIF(r.email, ''), NULLIF(r.name, ''), 'Email #' || r.id) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM email_settings r
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'email_accounts' AND tlr.resource_id = r.id
      WHERE r.id_user = $1
      ORDER BY r.id ASC`;
  } else {
    sql = `
      SELECT r.id,
             COALESCE(NULLIF(r.title, ''), NULLIF(r.slug, ''), 'Landing #' || r.id) AS label,
             (tlr.id IS NOT NULL) AS is_locked,
             tlr.locked_at
      FROM landing_pages r
      LEFT JOIN topup_locked_resources tlr
        ON tlr.resource_key = 'landing_pages' AND tlr.resource_id = r.id
      WHERE r.id_user = $1
      ORDER BY r.id ASC`;
  }

  const { rows } = await queryable.query(sql, [userId]);
  return rows.map((r) => ({
    id: Number(r.id),
    label: r.label,
    isLocked: Boolean(r.is_locked),
    lockedAt: r.locked_at,
  }));
}
