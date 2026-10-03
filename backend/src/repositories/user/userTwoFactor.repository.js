/**
 * Bảng user_two_factor (migration 276) — 1 dòng / user. Mọi hàm nhận `client` tuỳ chọn
 * (transaction/connection đang dùng); không truyền thì dùng pool chung.
 * Repository chỉ lo SQL — mã hoá/giải mã secret nằm ở service (totpSecretCrypto.util.js).
 */
import db from '../../config/database.js';

const q = (client) => client || db;

/** @returns {Promise<object|null>} dòng thô (secret_enc còn mã hoá) */
export async function findByUserId(userId, client) {
  const { rows } = await q(client).query('SELECT * FROM user_two_factor WHERE user_id = $1', [userId]);
  return rows[0] || null;
}

/** Thông tin đăng nhập tối thiểu của user (cho tắt 2FA / trạng thái). */
export async function findUserCredentials(userId, client) {
  const { rows } = await q(client).query(
    'SELECT id, username, email, auth_provider, password_hash FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

/** Ghi/ghi đè dòng PENDING (enabled_at NULL). Không đè dòng đã bật — gọi hàm này chỉ khi chưa bật. */
export async function upsertPending(userId, secretEnc, client) {
  const { rows } = await q(client).query(
    `INSERT INTO user_two_factor (user_id, secret_enc, enabled_at, recovery_codes, last_used_step,
                                  failed_attempts, locked_until, created_at, updated_at)
     VALUES ($1, $2, NULL, '[]'::jsonb, NULL, 0, NULL, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET secret_enc = EXCLUDED.secret_enc, enabled_at = NULL, recovery_codes = '[]'::jsonb,
           last_used_step = NULL, failed_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE user_two_factor.enabled_at IS NULL
     RETURNING user_id`,
    [userId, secretEnc]
  );
  return rows.length > 0;
}

/** Bật 2FA cho dòng pending. @returns {Promise<boolean>} false nếu không còn pending (đua nhau) */
export async function enable(userId, { recoveryHashes, lastUsedStep }, client) {
  const res = await q(client).query(
    `UPDATE user_two_factor
        SET enabled_at = NOW(), recovery_codes = $2::jsonb, last_used_step = $3,
            failed_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE user_id = $1 AND enabled_at IS NULL`,
    [userId, JSON.stringify(recoveryHashes), lastUsedStep]
  );
  return res.rowCount > 0;
}

export async function replaceRecoveryCodes(userId, hashes, client) {
  const res = await q(client).query(
    `UPDATE user_two_factor SET recovery_codes = $2::jsonb, updated_at = NOW()
      WHERE user_id = $1 AND enabled_at IS NOT NULL`,
    [userId, JSON.stringify(hashes)]
  );
  return res.rowCount > 0;
}

/** Rút một mã khôi phục khỏi mảng, chỉ khi mảng đang chứa nó. @returns {Promise<number>} rowCount (1 = dùng được) */
export async function consumeRecoveryCode(userId, hash, client) {
  const res = await q(client).query(
    `UPDATE user_two_factor
        SET recovery_codes = recovery_codes - $2::text, updated_at = NOW()
      WHERE user_id = $1 AND enabled_at IS NOT NULL AND recovery_codes @> to_jsonb($2::text)`,
    [userId, hash]
  );
  return res.rowCount;
}

/** Ghi nhận bước TOTP đã dùng, chỉ khi step lớn hơn bước đã ghi. @returns {Promise<number>} rowCount */
export async function markStepUsed(userId, step, client) {
  const res = await q(client).query(
    `UPDATE user_two_factor SET last_used_step = $2, updated_at = NOW()
      WHERE user_id = $1 AND $2::bigint > COALESCE(last_used_step, -1)`,
    [userId, step]
  );
  return res.rowCount;
}

/** Tăng bộ đếm sai trong MỘT câu UPDATE; đủ ngưỡng thì đặt locked_until. */
export async function bumpFailed(userId, { lockAfter = 5, lockMinutes = 15 } = {}, client) {
  const { rows } = await q(client).query(
    `UPDATE user_two_factor
        SET failed_attempts = failed_attempts + 1,
            locked_until = CASE WHEN failed_attempts + 1 >= $2
                                THEN NOW() + ($3 * INTERVAL '1 minute') ELSE locked_until END,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING failed_attempts, locked_until`,
    [userId, lockAfter, lockMinutes]
  );
  return rows[0] || null;
}

export async function resetFailed(userId, client) {
  await q(client).query(
    `UPDATE user_two_factor SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE user_id = $1 AND (failed_attempts <> 0 OR locked_until IS NOT NULL)`,
    [userId]
  );
}

/** @returns {Promise<boolean>} true nếu có dòng bị xoá */
export async function deleteByUserId(userId, client) {
  const res = await q(client).query('DELETE FROM user_two_factor WHERE user_id = $1', [userId]);
  return res.rowCount > 0;
}

export default {
  findByUserId,
  findUserCredentials,
  upsertPending,
  enable,
  replaceRecoveryCodes,
  consumeRecoveryCode,
  markStepUsed,
  bumpFailed,
  resetFailed,
  deleteByUserId,
};
