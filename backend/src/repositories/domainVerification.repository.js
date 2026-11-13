import db from '../config/database.js';

class DomainVerificationRepository {
  /**
   * Lấy mã xác thực tên miền cho một nền tảng (zalo/facebook) và domain
   * @param {string} platform e.g. 'zalo'
   * @param {string} domain e.g. 'app.hanhchinh.ai.vn'
   */
  async getVerification(platform = 'zalo', domain) {
    const { rows } = await db.query(
      `SELECT * FROM system_domain_verifications
       WHERE platform = $1 AND (domain = $2 OR domain = '')
       ORDER BY CASE WHEN domain = $2 THEN 0 ELSE 1 END
       LIMIT 1`,
      [platform, domain]
    );
    return rows[0] || null;
  }

  /**
   * Tìm bất kỳ mã xác thực nào của Zalo khớp với code/hash hoặc lấy mã mới nhất
   * @param {string} platform
   */
  async getLatestVerification(platform = 'zalo') {
    const { rows } = await db.query(
      `SELECT * FROM system_domain_verifications
       WHERE platform = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
      [platform]
    );
    return rows[0] || null;
  }

  /**
   * Lưu hoặc cập nhật mã xác thực tên miền
   * @param {object} params
   * @param {string} params.platform
   * @param {string} params.domain
   * @param {string} params.verificationCode
   * @param {string} [params.fileName]
   */
  async upsertVerification({ platform = 'zalo', domain, verificationCode, fileName }) {
    const cleanDomain = String(domain || '').trim().toLowerCase();
    const cleanCode = String(verificationCode || '').trim();
    const cleanFile = fileName ? String(fileName).trim() : null;

    const { rows } = await db.query(
      `INSERT INTO system_domain_verifications (platform, domain, verification_code, file_name, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (platform, domain) DO UPDATE SET
         verification_code = EXCLUDED.verification_code,
         file_name = COALESCE(EXCLUDED.file_name, system_domain_verifications.file_name),
         updated_at = NOW()
       RETURNING *`,
      [platform, cleanDomain, cleanCode, cleanFile]
    );
    return rows[0];
  }
}

export default new DomainVerificationRepository();

