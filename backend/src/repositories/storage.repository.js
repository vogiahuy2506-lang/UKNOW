import db from '../config/database.js';
import { EFFECTIVE_PLAN_ID_SQL } from '../utils/billingCycle.util.js';

export const QUOTA_USAGE_STATES = ['active', 'temp', 'cleanup_pending'];

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
      ORDER BY id ASC
      LIMIT $3`,
    [afterId, QUOTA_USAGE_STATES, limit]
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
