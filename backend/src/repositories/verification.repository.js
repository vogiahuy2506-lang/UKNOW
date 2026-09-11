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

  // ─── OTP theo SĐT (PR-1, xác thực SĐT) ──────────────────────────────────────
  //
  // Khoá theo SĐT ĐÃ CHUẨN HOÁ (normalizePhoneForZaloCampaign, gọi ở tầng service) +
  // user_id — KHÔNG tái dùng nhánh LOWER(email) phía trên (Bẫy #1 trong plan: trộn cột
  // email với SĐT sẽ làm cooldown/lookup của hai luồng lẫn vào nhau). type luôn
  // 'phone_otp' để tách khỏi 'email_verification'/'employee_invitation'/'password_reset'.

  /**
   * @param {{ phone: string, userId: number, code: string, expiresInMinutes: number }} input
   * @returns {Promise<{id: number}>}
   */
  async createPhoneCode({ phone, userId, code, expiresInMinutes }) {
    const result = await db.query(
      `INSERT INTO verification_codes (phone, user_id, code, type, expires_at)
       VALUES ($1, $2, $3, 'phone_otp', NOW() + ($4 || ' minutes')::interval)
       RETURNING id`,
      [phone, userId, code, expiresInMinutes]
    );
    return result.rows[0];
  }

  /**
   * Vô hiệu các mã 'phone_otp' còn hiệu lực trước đó của (phone, userId) — gọi TRƯỚC
   * createPhoneCode, cùng khuôn markUnusedCodesAsUsed(email, type) ở trên. Không làm vậy
   * thì một mã cũ chưa hết hạn vẫn verify được sau khi đã có mã mới hơn — attempts (5 lần
   * sai mã chết) sẽ tính sai mã vì có nhiều bản ghi "đang hiệu lực" cùng lúc.
   * @param {string} phone
   * @param {number} userId
   * @returns {Promise<void>}
   */
  async markUnusedPhoneCodesAsUsed(phone, userId) {
    await db.query(
      `UPDATE verification_codes
       SET is_used = TRUE
       WHERE phone = $1 AND user_id = $2 AND type = 'phone_otp' AND is_used = FALSE`,
      [phone, userId]
    );
  }

  /**
   * @param {{ phone: string, userId: number, code: string }} input
   * @returns {Promise<object|null>}
   */
  async findValidPhoneCode({ phone, userId, code }) {
    const result = await db.query(
      `SELECT * FROM verification_codes
       WHERE phone = $1 AND user_id = $2 AND code = $3 AND type = 'phone_otp'
         AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, userId, code]
    );
    return result.rows[0] || null;
  }

  /**
   * Mã 'phone_otp' còn hiệu lực gần nhất của (phone, userId) — dùng để cộng attempts
   * khi verify sai mà không cần biết trước id (caller không luôn có id trong tay).
   * @param {{ phone: string, userId: number }} input
   * @returns {Promise<object|null>}
   */
  async findLatestActivePhoneCode({ phone, userId }) {
    const result = await db.query(
      `SELECT * FROM verification_codes
       WHERE phone = $1 AND user_id = $2 AND type = 'phone_otp'
         AND is_used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [phone, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Cooldown gửi OTP theo SĐT (mặc định 60s) — độc lập với getSendCooldown(email).
   * @param {string} phone SĐT đã chuẩn hoá
   * @param {number} [cooldownSeconds=60]
   * @returns {Promise<{ blocked: boolean, retryAfterSec?: number }>}
   */
  async getPhoneSendCooldown(phone, cooldownSeconds = 60) {
    const { rows } = await db.query(
      `SELECT EXTRACT(EPOCH FROM (created_at + ($2 || ' seconds')::interval - NOW()))::int AS retry_after
       FROM verification_codes
       WHERE phone = $1 AND type = 'phone_otp'
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, cooldownSeconds]
    );
    const retryAfter = Number(rows[0]?.retry_after);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return { blocked: true, retryAfterSec: retryAfter };
    }
    return { blocked: false };
  }

  /**
   * Cộng attempts cho một lần nhập sai mã — trần "5 lần sai mã chết" đọc giá trị trả về.
   * @param {number} id id của verification_codes
   * @returns {Promise<number|null>} attempts sau khi cộng, null nếu không tìm thấy row
   */
  async bumpAttempts(id) {
    const { rows } = await db.query(
      `UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [id]
    );
    return rows[0]?.attempts ?? null;
  }

  /**
   * Đếm số mã 'phone_otp' đã tạo cho MỘT SĐT trong 24 giờ gần nhất — trần "5 mã/số/ngày".
   * @param {string} phone
   * @returns {Promise<number>}
   */
  async countPhoneCodesLast24h(phone) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM verification_codes
       WHERE phone = $1 AND type = 'phone_otp' AND created_at > NOW() - INTERVAL '24 hours'`,
      [phone]
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * Đếm số mã 'phone_otp' đã tạo cho MỘT user (bất kể số) trong 24 giờ gần nhất — trần
   * "5 mã/user/ngày" (chặn user đổi số liên tục để né trần theo số).
   * @param {number} userId
   * @returns {Promise<number>}
   */
  async countUserPhoneCodesLast24h(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM verification_codes
       WHERE user_id = $1 AND type = 'phone_otp' AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * Đếm TOÀN HỆ THỐNG số mã 'phone_otp' đã tạo trong 24 giờ gần nhất — trần chi phí
   * PHONE_OTP_DAILY_CAP (mặc định 300, Bẫy #2: OTP SMS tốn tiền thật).
   * @returns {Promise<number>}
   */
  async countAllPhoneCodesLast24h() {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM verification_codes
       WHERE type = 'phone_otp' AND created_at > NOW() - INTERVAL '24 hours'`
    );
    return rows[0]?.n ?? 0;
  }
}

export default new VerificationRepository();
