/**
 * Repository for user_whatsapp_app_credentials.
 *
 * Each user may register multiple Meta Apps over time (e.g. dev/staging vs.
 * prod) but only one can be marked `is_default = true`. The OAuth flow picks
 * the default row when no explicit `app_id` is supplied by the caller.
 *
 * `app_secret_encrypted` is stored as-is (already AES-256-GCM encrypted).
 * Decryption happens in whatsappCredentials.service.js — never in this repo.
 */
import db from '../../config/database.js';

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.id_user,
    appId: row.app_id,
    appName: row.app_name || '',
    webhookVerifyToken: row.webhook_verify_token || null,
    isDefault: !!row.is_default,
    isActive: !!row.is_active,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // NOTE: deliberately do NOT expose app_secret_encrypted to callers.
  };
}

async function listByUser(userId) {
  const result = await db.query(
    `SELECT id, id_user, app_id, app_name, webhook_verify_token,
            is_default, is_active, last_used_at, created_at, updated_at
       FROM user_whatsapp_app_credentials
      WHERE id_user = $1
      ORDER BY is_default DESC, created_at DESC`,
    [userId]
  );
  return result.rows.map(normalizeRow);
}

async function findById(id, userId) {
  const result = await db.query(
    `SELECT id, id_user, app_id, app_name, webhook_verify_token,
            is_default, is_active, last_used_at, created_at, updated_at
       FROM user_whatsapp_app_credentials
      WHERE id = $1 AND id_user = $2`,
    [id, userId]
  );
  return normalizeRow(result.rows[0]);
}

async function findByAppId(userId, appId) {
  const result = await db.query(
    `SELECT id, id_user, app_id, app_secret_encrypted, app_name,
            webhook_verify_token, is_default, is_active,
            last_used_at, created_at, updated_at
       FROM user_whatsapp_app_credentials
      WHERE id_user = $1 AND app_id = $2`,
    [userId, appId]
  );
  return result.rows[0] || null;
}

async function getDefault(userId) {
  const result = await db.query(
    `SELECT id, id_user, app_id, app_secret_encrypted, app_name,
            webhook_verify_token, is_default, is_active,
            last_used_at, created_at, updated_at
       FROM user_whatsapp_app_credentials
      WHERE id_user = $1 AND is_default = true AND is_active = true
      LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function findActiveForUser(userId) {
  // Return the active row to use as fallback when getDefault misses.
  // Prefer the most-recently-used, then most-recently-created.
  const result = await db.query(
    `SELECT id, id_user, app_id, app_secret_encrypted, app_name,
            webhook_verify_token, is_default, is_active,
            last_used_at, created_at, updated_at
       FROM user_whatsapp_app_credentials
      WHERE id_user = $1 AND is_active = true
      ORDER BY is_default DESC, last_used_at DESC NULLS LAST, created_at DESC
      LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function create({
  userId,
  appId,
  appSecretEncrypted,
  appName,
  webhookVerifyToken,
  makeDefault,
}) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // If this is the first row OR caller asked to make it default, clear
    // existing default flag first to keep partial UNIQUE happy.
    const existing = await client.query(
      'SELECT COUNT(*)::int AS n FROM user_whatsapp_app_credentials WHERE id_user = $1',
      [userId]
    );
    const isFirst = existing.rows[0].n === 0;
    const shouldBeDefault = !!makeDefault || isFirst;

    if (shouldBeDefault) {
      await client.query(
        'UPDATE user_whatsapp_app_credentials SET is_default = false, updated_at = NOW() WHERE id_user = $1',
        [userId]
      );
    }

    const result = await client.query(
      `INSERT INTO user_whatsapp_app_credentials
        (id_user, app_id, app_secret_encrypted, app_name, webhook_verify_token, is_default, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, id_user, app_id, app_name, webhook_verify_token,
                 is_default, is_active, last_used_at, created_at, updated_at`,
      [userId, appId, appSecretEncrypted, appName || null, webhookVerifyToken || null, shouldBeDefault]
    );
    await client.query('COMMIT');
    return normalizeRow(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setDefault(id, userId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE user_whatsapp_app_credentials SET is_default = false WHERE id_user = $1',
      [userId]
    );
    const result = await client.query(
      `UPDATE user_whatsapp_app_credentials
          SET is_default = true, updated_at = NOW()
        WHERE id = $1 AND id_user = $2
        RETURNING id, id_user, app_id, app_name, webhook_verify_token,
                  is_default, is_active, last_used_at, created_at, updated_at`,
      [id, userId]
    );
    await client.query('COMMIT');
    return normalizeRow(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function setActive(id, userId, isActive) {
  const result = await db.query(
    `UPDATE user_whatsapp_app_credentials
        SET is_active = $3, updated_at = NOW()
      WHERE id = $1 AND id_user = $2
      RETURNING id, id_user, app_id, app_name, webhook_verify_token,
                is_default, is_active, last_used_at, created_at, updated_at`,
    [id, userId, !!isActive]
  );
  return normalizeRow(result.rows[0]);
}

async function deleteById(id, userId) {
  const result = await db.query(
    'DELETE FROM user_whatsapp_app_credentials WHERE id = $1 AND id_user = $2 RETURNING id',
    [id, userId]
  );
  return result.rowCount > 0;
}

async function touchLastUsed(id) {
  await db.query(
    'UPDATE user_whatsapp_app_credentials SET last_used_at = NOW() WHERE id = $1',
    [id]
  );
}

export default {
  listByUser,
  findById,
  findByAppId,
  getDefault,
  findActiveForUser,
  create,
  setDefault,
  setActive,
  deleteById,
  touchLastUsed,
};
