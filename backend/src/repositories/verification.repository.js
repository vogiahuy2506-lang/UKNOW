import db from '../config/database.js';

class VerificationRepository {
  async markUnusedCodesAsUsed(email, type) {
    await db.query(
      'UPDATE verification_codes SET is_used = TRUE WHERE LOWER(email) = LOWER($1) AND type = $2 AND is_used = FALSE',
      [email, type]
    );
  }

  async createCode({ email, code, type, expiresInMinutes }) {
    const result = await db.query(
      `INSERT INTO verification_codes (email, code, type, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval)
       RETURNING id`,
      [email, code, type, expiresInMinutes]
    );
    return result.rows[0];
  }

  /**
   * Cooldown gửi mã theo email (mặc định 60s).
   * @returns {Promise<{ blocked: boolean, retryAfterSec?: number }>}
   */
  async getSendCooldown(email, type = 'email_verification', cooldownSeconds = 60) {
    const { rows } = await db.query(
      `SELECT EXTRACT(EPOCH FROM (created_at + ($3 || ' seconds')::interval - NOW()))::int AS retry_after
       FROM verification_codes
       WHERE LOWER(email) = LOWER($1) AND type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [email, type, cooldownSeconds]
    );
    const retryAfter = Number(rows[0]?.retry_after);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return { blocked: true, retryAfterSec: retryAfter };
    }
    return { blocked: false };
  }

  async findValidCode({ email, code, type }) {
    const result = await db.query(
      `SELECT * FROM verification_codes
       WHERE LOWER(email) = LOWER($1) AND code = $2 AND type = $3 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, code, type]
    );
    return result.rows[0] || null;
  }

  async markAsUsed(id) {
    await db.query(
      'UPDATE verification_codes SET is_used = TRUE WHERE id = $1',
      [id]
    );
  }

  async findValidToken({ token, type }) {
    const result = await db.query(
      `SELECT * FROM verification_codes
       WHERE code = $1 AND type = $2 AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [token, type]
    );
    return result.rows[0] || null;
  }

  async userExistsByEmail(email) {
    const result = await db.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows.length > 0;
  }

  async userExistsByUsername(username) {
    const result = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    return result.rows.length > 0;
  }
}

export default new VerificationRepository();
