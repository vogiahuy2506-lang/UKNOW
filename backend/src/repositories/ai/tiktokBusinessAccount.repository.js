/**
 * tiktokBusinessAccount.repository.js
 *
 * Data access for TikTok Business accounts (one per (id_user, business_id)).
 * Pattern copy từ `channelConnections.repository.js` (Facebook) và
 * `chatbotTelegram.repository.js` (Telegram personal):
 * - ownership check ở mọi method có userId để chống IDOR
 * - access_token / refresh_token đã được caller mã hoá bằng
 *   `encryptSmtpSecret` (`backend/src/utils/smtpSecretCrypto.js:51-64`,
 *   AES-256-GCM, key SMTP_SECRET_KEY env, prefix `enc:v1:`). Repo chỉ
 *   nhận ciphertext, KHÔNG tự mã hoá.
 * - findExpiringForRefresh trả về row có `access_token_expires_at < now() + buffer`,
 *   dùng cho cron refresh (PR-1 việc 2.3).
 *
 * Việc 2.1 của plan tiktok-business-messaging-integration.md.
 */

import db from '../../config/database.js';

class TiktokBusinessAccountRepository {
  /**
   * List active TikTok Business accounts của 1 user.
   * Trả về row kèm cả ciphertext — caller (controller) phải `sanitize`
   * bỏ `access_token` / `refresh_token` trước khi trả ra HTTP response.
   *
   * @param {number} userId
   * @returns {Promise<Array<object>>}
   */
  async listByUser(userId) {
    const { rows } = await db.query(
      `SELECT id, id_user, business_id, display_name, scope,
              access_token_expires_at, refresh_token_expires_at,
              is_active, last_webhook_at, region, role,
              created_at, updated_at
       FROM tiktok_business_accounts
       WHERE id_user = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  /**
   * Tìm theo (userId, businessId) — dùng cho OAuth callback để biết user
   * đã liên kết business này chưa.
   *
   * @param {number} userId
   * @param {string} businessId
   * @returns {Promise<object|null>}
   */
  async findByBusinessId(userId, businessId) {
    const { rows } = await db.query(
      `SELECT * FROM tiktok_business_accounts
       WHERE id_user = $1 AND business_id = $2`,
      [userId, businessId]
    );
    return rows[0] || null;
  }

  /**
   * Tìm theo businessId KHÔNG cần userId — chỉ dùng nội bộ (webhook, cron)
   * đã verify ownership ở layer trên. HTTP KHÔNG BAO GIỜ gọi method này.
   *
   * @param {string} businessId
   * @returns {Promise<object|null>}
   */
  async findByBusinessIdAnyUser(businessId) {
    const { rows } = await db.query(
      `SELECT * FROM tiktok_business_accounts
       WHERE business_id = $1 AND is_active = true
       LIMIT 1`,
      [businessId]
    );
    return rows[0] || null;
  }

  /**
   * Tìm theo (id, userId) — có check ownership để chống IDOR.
   * Pattern copy từ `channelConnections.repository.js:96-100`
   * (`getFacebookConnectionById`).
   *
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findById(id, userId) {
    const { rows } = await db.query(
      `SELECT * FROM tiktok_business_accounts
       WHERE id = $1 AND id_user = $2`,
      [id, userId]
    );
    return rows[0] || null;
  }

  /**
   * Tìm theo id KHÔNG cần userId — chỉ dùng nội bộ service (adapter, cron)
   * đã verify ownership ở layer trên. HTTP KHÔNG BAO GIỜ gọi method này.
   *
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  async findByIdAnyUser(id) {
    const { rows } = await db.query(
      `SELECT * FROM tiktok_business_accounts WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Upsert account. Caller mã hoá access/refresh token bằng `encryptSmtpSecret`
   * trước khi gọi (giống pattern `chatbotTelegram.repository.js`).
   *
   * @param {object} params
   * @returns {Promise<object>}
   */
  async upsert({
    userId,
    businessId,
    displayName,
    accessToken,         // ciphertext
    refreshToken,        // ciphertext
    scope,
    accessExpiresAt,
    refreshExpiresAt,
    region,
    role,
  }) {
    const { rows } = await db.query(
      `INSERT INTO tiktok_business_accounts
         (id_user, business_id, display_name, access_token, refresh_token,
          scope, access_token_expires_at, refresh_token_expires_at, region, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT ON CONSTRAINT uq_tiktok_business_accounts_user_business DO UPDATE SET
         display_name = EXCLUDED.display_name,
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         scope = EXCLUDED.scope,
         access_token_expires_at = EXCLUDED.access_token_expires_at,
         refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
         region = EXCLUDED.region,
         role = EXCLUDED.role,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [
        userId,
        businessId,
        displayName || null,
        accessToken,
        refreshToken,
        scope || null,
        accessExpiresAt,
        refreshExpiresAt,
        region || null,
        role || null,
      ]
    );
    return rows[0];
  }

  /**
   * Cập nhật token mới sau khi refresh. Cả 2 field đều nhận ciphertext.
   * Pattern copy từ `channelConnections.repository.js:130-143`
   * (`refreshFacebookPageToken`).
   *
   * @param {number} id
   * @param {object} params
   */
  async updateTokens(id, { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt }) {
    const { rows } = await db.query(
      `UPDATE tiktok_business_accounts
       SET access_token = $2,
           refresh_token = $3,
           access_token_expires_at = $4,
           refresh_token_expires_at = $5,
           is_active = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [id, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt]
    );
    return rows[0] || null;
  }

  /**
   * Soft-delete: chuyển is_active = false. Caller verify ownership trước
   * (gọi findById với userId).
   *
   * @param {number} id
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async deactivate(id, userId) {
    const { rows } = await db.query(
      `UPDATE tiktok_business_accounts
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING id`,
      [id, userId]
    );
    return rows.length > 0;
  }

  /**
   * Webhook tick: update last_webhook_at. KHÔNG cần userId vì TikTok
   * webhook URL global (Bẫy 5) — việc tra userId thuộc controller.
   *
   * @param {number} id
   */
  async touchWebhook(id) {
    await db.query(
      `UPDATE tiktok_business_accounts
       SET last_webhook_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Cron refresh: trả về các account sắp hết hạn trong `bufferHours` tới.
   * Dùng cho `backend/src/services/tiktok/tiktokTokenRefresh.service.js`.
   *
   * @param {number} bufferHours
   * @returns {Promise<Array<object>>}
   */
  async findExpiringForRefresh(bufferHours = 2) {
    const { rows } = await db.query(
      `SELECT * FROM tiktok_business_accounts
       WHERE is_active = true
         AND access_token_expires_at < (NOW() + ($1 || ' hours')::INTERVAL)
       ORDER BY access_token_expires_at ASC
       LIMIT 100`,
      [bufferHours]
    );
    return rows;
  }
}

export default new TiktokBusinessAccountRepository();
