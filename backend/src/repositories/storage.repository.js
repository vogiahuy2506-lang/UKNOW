import db from '../config/database.js';
import { EFFECTIVE_PLAN_ID_SQL } from '../utils/billingCycle.util.js';

export const QUOTA_USAGE_STATES = ['active', 'temp', 'cleanup_pending'];

/**
 * Trạng thái đối soát quét. Mảng RIÊNG, không gộp vào QUOTA_USAGE_STATES (hằng đó còn dùng để tính dung lượng).
 * Thêm 'orphaned' để đối soát tự lành: dòng bị đánh dấu mất nhầm (vd mất quyền GCS) sẽ được đưa về active
 * khi tệp còn trên kho.
 */
export const RECONCILE_SCAN_STATES = [...QUOTA_USAGE_STATES, 'orphaned'];

export async function acquireStorageQuotaLock(client, ownerUserId) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
    [`storage:${ownerUserId}`, 'storage_quota']
  );
}

export async function getEffectiveQuota(ownerUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT u.storage_quota_override_bytes AS "overrideBytes",
            p.storage_limit_bytes AS "planLimitBytes"
       FROM users u
       LEFT JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
      WHERE u.id = $1
      LIMIT 1`,
    [ownerUserId]
  );
  return rows[0] || null;
}

export async function getWorkspaceUsage(ownerUserId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(size_bytes), 0)::text AS "usedBytes"
       FROM storage_objects
      WHERE owner_user_id = $1
        AND pool_type = 'workspace'
        AND state = ANY($2::varchar[])`,
    [ownerUserId, QUOTA_USAGE_STATES]
  );
  return rows[0]?.usedBytes || '0';
}

export async function insertStorageObject(data, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO storage_objects
      (pool_type, owner_user_id, actor_user_id, storage_key, temp_key, category, state,
       size_bytes, expires_at, reference_type, reference_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, pool_type AS "poolType", owner_user_id AS "ownerUserId",
       actor_user_id AS "actorUserId", storage_key AS "storageKey", temp_key AS "tempKey",
       category, state, size_bytes AS "sizeBytes", expires_at AS "expiresAt",
       reference_type AS "referenceType", reference_id AS "referenceId"`,
    [
      data.poolType,
      data.ownerUserId ?? null,
      data.actorUserId ?? null,
      data.storageKey ?? null,
      data.tempKey ?? null,
      data.category,
      data.state,
      data.sizeBytes,
      data.expiresAt ?? null,
      data.referenceType ?? null,
      data.referenceId ?? null,
    ]
  );
  return rows[0];
}

export async function findStorageObjectByTempKey(tempKey, queryable = db, { forUpdate = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT * FROM storage_objects WHERE temp_key = $1 LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [tempKey]
  );
  return rows[0] || null;
}

export async function findStorageObjectByKey(storageKey, queryable = db, { forUpdate = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT * FROM storage_objects WHERE storage_key = $1 LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [storageKey]
  );
  return rows[0] || null;
}

export async function findStorageObjectById(id, queryable = db, { forUpdate = false } = {}) {
  const { rows } = await queryable.query(
    `SELECT * FROM storage_objects WHERE id = $1 LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return rows[0] || null;
}

export async function listStorageObjectsForReconcile({ afterId = 0, limit = 200 } = {}, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT *
       FROM storage_objects
      WHERE id > $1
        AND state = ANY($2::varchar[])
        AND (state <> 'orphaned' OR storage_key IS NOT NULL)
      ORDER BY id ASC
      LIMIT $3`,
    [afterId, RECONCILE_SCAN_STATES, limit]
  );
  return rows;
}

export async function listTrackedStorageKeys(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT storage_key, temp_key
       FROM storage_objects
      WHERE state <> 'deleted'
        AND (storage_key IS NOT NULL OR temp_key IS NOT NULL)`
  );
  return rows;
}

export async function updateStorageObjectSize(id, sizeBytes, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET size_bytes = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, sizeBytes]
  );
  return rows[0] || null;
}

/** Đưa dòng 'orphaned' về 'active' (tệp còn trên kho). Chỉ đụng dòng đang orphaned. */
export async function restoreOrphanedStorageObject(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET state = 'active', updated_at = NOW()
      WHERE id = $1 AND state = 'orphaned' AND storage_key IS NOT NULL
      RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

export async function markStorageObjectOrphaned(id, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET state = 'orphaned', updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

export async function activateStorageObject({ id, storageKey, category, expiresAt, referenceType, referenceId }, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET storage_key = $2, state = 'active', category = COALESCE($3, category),
            expires_at = COALESCE($4, expires_at), reference_type = COALESCE($5, reference_type),
            reference_id = COALESCE($6, reference_id), updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id, storageKey, category ?? null, expiresAt ?? null, referenceType ?? null, referenceId ?? null]
  );
  return rows[0] || null;
}

export async function clearTempKey(id, queryable = db) {
  await queryable.query(
    `UPDATE storage_objects SET temp_key = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function markStorageObjectDeleted(id, queryable = db) {
  await queryable.query(
    `UPDATE storage_objects
        SET state = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [id]
  );
}

export async function markStorageObjectCleanupPending(id, queryable = db) {
  await queryable.query(
    `UPDATE storage_objects SET state = 'cleanup_pending', updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function activateLandingAssetStorageObjects(
  { storageKeys, ownerUserId, landingPageId },
  queryable = db
) {
  if (!Array.isArray(storageKeys) || storageKeys.length === 0) return [];
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET state = 'active',
            expires_at = NULL,
            reference_type = 'landing_page',
            reference_id = $3,
            updated_at = NOW()
      WHERE storage_key = ANY($1::text[])
        AND owner_user_id = $2
        AND category = 'landing_asset'
        AND state IN ('temp', 'active')
    RETURNING *`,
    [storageKeys, ownerUserId, String(landingPageId)]
  );
  return rows;
}

/**
 * PR-4a (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md) — bản `form_asset`/`form` của
 * `activateLandingAssetStorageObjects` phía trên. Hàm riêng thay vì tham số hoá category/
 * referenceType chung: hai luồng (landing/form) không dùng chung transaction hay call site, và
 * giữ riêng giúp đọc SQL trực tiếp thấy đúng loại tài nguyên đang chạm, không phải suy từ tham số.
 */
export async function activateFormAssetStorageObjects(
  { storageKeys, ownerUserId, formId },
  queryable = db
) {
  if (!Array.isArray(storageKeys) || storageKeys.length === 0) return [];
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET state = 'active',
            expires_at = NULL,
            reference_type = 'form',
            reference_id = $3,
            updated_at = NOW()
      WHERE storage_key = ANY($1::text[])
        AND owner_user_id = $2
        AND category = 'form_asset'
        AND state IN ('temp', 'active')
    RETURNING *`,
    [storageKeys, ownerUserId, String(formId)]
  );
  return rows;
}


/**
 * PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-4 — gắn tệp đính kèm ticket hỗ trợ: `temp` → `active` + tham chiếu ticket.
 * Hàm riêng (không dùng `promoteTempStorageObject`): tệp đã nằm sẵn ở kho dưới `storage_key` ở trạng thái `temp`, không có bản
 * trong thư mục tải tạm để sao chép — chỉ cần đổi dòng sổ cái.
 *
 * Mỗi id phải: do CHÍNH người thao tác tải lên (`actor_user_id`), thuộc category `support_ticket`, còn `temp` và CHƯA hết hạn.
 * Id nào không thoả sẽ không có trong kết quả — caller so số dòng trả về với số id gửi lên để từ chối cả lô.
 * Chạy trong cùng giao dịch với việc chèn tin để lỗi giữa chừng không để lại tệp active mồ côi.
 *
 * @param {{ objectIds: number[], actorUserId: number, ticketId: number|string }} params
 * @param {object} [queryable]
 * @returns {Promise<Array<{ id: string, storage_key: string, size_bytes: string }>>}
 */
export async function activateSupportTicketStorageObjects(
  { objectIds, actorUserId, ticketId },
  queryable = db
) {
  if (!Array.isArray(objectIds) || objectIds.length === 0) return [];
  const { rows } = await queryable.query(
    `UPDATE storage_objects
        SET state = 'active',
            expires_at = NULL,
            reference_type = 'support_ticket',
            reference_id = $3,
            updated_at = NOW()
      WHERE id = ANY($1::bigint[])
        AND actor_user_id = $2
        AND category = 'support_ticket'
        AND state = 'temp'
        AND storage_key IS NOT NULL
        AND (expires_at IS NULL OR expires_at > NOW())
    RETURNING id, storage_key, size_bytes`,
    [objectIds, actorUserId, String(ticketId)]
  );
  return rows;
}

/**
 * Dòng sổ cái của các tệp đính kèm ticket (dùng khi phát tệp: xác nhận tệp còn `active` và đúng ticket).
 *
 * @param {number|string} objectId
 * @param {object} [queryable]
 * @returns {Promise<object|null>}
 */
export async function findSupportTicketStorageObject(objectId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, storage_key, size_bytes, state, reference_type, reference_id
       FROM storage_objects
      WHERE id = $1 AND category = 'support_ticket'
      LIMIT 1`,
    [objectId]
  );
  return rows[0] || null;
}
