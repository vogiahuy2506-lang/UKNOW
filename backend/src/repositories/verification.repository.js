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
}

export default new VerificationRepository();
