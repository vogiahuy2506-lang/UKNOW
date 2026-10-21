import db from '../../config/database.js';

class PlatformStoreAccessRepository {
  /**
   * Đọc role của một tài khoản (chủ workspace). Không có tài khoản -> null.
   *
   * @param {number|string} userId
   * @returns {Promise<string|null>}
   */
  async findRoleByUserId(userId) {
    const result = await db.query('SELECT role FROM users WHERE id = $1 LIMIT 1', [userId]);
    return result.rows[0]?.role ?? null;
  }
}

export default new PlatformStoreAccessRepository();
