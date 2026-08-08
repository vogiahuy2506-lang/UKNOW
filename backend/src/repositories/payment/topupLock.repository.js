import db from '../../config/database.js';

/** Resource keys in scope for PR-2 (employees excluded). */
export const LOCKABLE_RESOURCE_KEYS = Object.freeze([
  'zalo_accounts',
  'email_accounts',
  'landing_pages',
  'chatbots',
]);

const RESOURCE_TABLE = Object.freeze({
  zalo_accounts: 'zalo_settings',
  email_accounts: 'email_settings',
  landing_pages: 'landing_pages',
  chatbots: 'custom_chatbots',
});

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
  const { rowCount } = await queryable.query(
    `DELETE FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = $2
       AND NOT EXISTS (
         SELECT 1 FROM ${table} r WHERE r.id = tlr.resource_id
       )`,
    [userId, resourceKey]
  );
  return rowCount || 0;
}

/**
 * Count lock rows that still JOIN to the target table.
 */
export async function countValidLocks(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return 0;
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS total
     FROM topup_locked_resources tlr
     WHERE tlr.user_id = $1
       AND tlr.resource_key = $2
       AND EXISTS (
         SELECT 1 FROM ${table} r WHERE r.id = tlr.resource_id
       )`,
    [userId, resourceKey]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * List unlocked resource ids newest-first (for locking).
 * Chatbots: only is_active = true. Others: all rows.
 */
export async function listUnlockedResourceIds(userId, resourceKey, queryable = db) {
  const table = RESOURCE_TABLE[resourceKey];
  if (!table) return [];

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

  const params = resourceKey === 'chatbots' ? [userId] : [userId, resourceKey];
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
    [LOCKABLE_RESOURCE_KEYS, String(maxDays), String(minDays), reminderThreshold]
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

  let sql;
  if (resourceKey === 'chatbots') {
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
