// Pool Postgres: file thực tế nằm tại `src/config/database.js` (cùng cấp với `repositories/`)
import db from '../../config/database.js';

class ZaloCampaignRecipientRepository {
  /**
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @returns {Promise<boolean>}
   */
  async isPhoneUnreachable(userId, phoneNormalized) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    if (!Number.isFinite(uid) || uid <= 0 || !phone) return false;
    const result = await db.query(
      `SELECT 1 FROM zalo_unreachable_phones
       WHERE id_user = $1 AND phone_normalized = $2
       LIMIT 1`,
      [uid, phone]
    );
    return result.rows.length > 0;
  }

  /**
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @param {string} reason
   * @returns {Promise<void>}
   */
  async upsertUnreachablePhone(userId, phoneNormalized, reason) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    const safeReason = String(reason || 'not_found').trim().slice(0, 50) || 'not_found';
    if (!Number.isFinite(uid) || uid <= 0 || !phone) return;
    await db.query(
      `INSERT INTO zalo_unreachable_phones (id_user, phone_normalized, reason, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id_user, phone_normalized)
       DO UPDATE SET reason = EXCLUDED.reason, updated_at = CURRENT_TIMESTAMP`,
      [uid, phone, safeReason]
    );
  }

  /**
   * Lấy id tài khoản Zalo đã ghim cho (user, lượt chạy, SĐT). Không trả hàng chỉ có cột error.
   *
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @param {number|string} campaignRunId id campaign_runs
   * @returns {Promise<number|null>} id_zalo_account hoặc null
   */
  async getSenderBindingAccountId(userId, phoneNormalized, campaignRunId) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    const rid = Number.parseInt(campaignRunId, 10);
    if (!Number.isFinite(uid) || uid <= 0 || !phone || !Number.isFinite(rid) || rid <= 0) return null;
    const result = await db.query(
      `SELECT id_zalo_account FROM zalo_personal_sender_bindings
       WHERE id_user = $1 AND id_campaign_run = $2 AND phone_normalized = $3
         AND error IS NULL AND id_zalo_account IS NOT NULL
       LIMIT 1`,
      [uid, rid, phone]
    );
    const id = result.rows[0]?.id_zalo_account;
    const parsed = Number.parseInt(id, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Ghi/ghi đè ghim SĐT ↔ TK Zalo cho một lượt chạy (chỉ khi gửi thành công chọn được TK).
   *
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @param {number|string} zaloAccountId
   * @param {number|string} campaignRunId
   * @returns {Promise<void>}
   */
  async upsertSenderBinding(userId, phoneNormalized, zaloAccountId, campaignRunId) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    const aid = Number.parseInt(zaloAccountId, 10);
    const rid = Number.parseInt(campaignRunId, 10);
    if (!Number.isFinite(uid) || uid <= 0 || !phone || !Number.isFinite(aid) || aid <= 0) return;
    if (!Number.isFinite(rid) || rid <= 0) return;
    await db.query(
      `INSERT INTO zalo_personal_sender_bindings (
         id_user, id_campaign_run, phone_normalized, id_zalo_account, error, updated_at
       )
       VALUES ($1, $2, $3, $4, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT (id_user, id_campaign_run, phone_normalized)
       DO UPDATE SET
         id_zalo_account = EXCLUDED.id_zalo_account,
         error = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [uid, rid, phone, aid]
    );
  }

  /**
   * Ghi nhận lỗi theo lượt chạy (vd. không tìm thấy SĐT) — một dòng audit trong bảng binding,
   * đồng thời luồng gửi vẫn dùng zalo_unreachable_phones để chặn toàn cục.
   *
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @param {number|string} campaignRunId
   * @param {string} errorCode mã ngắn (vd. not_found)
   * @returns {Promise<void>}
   */
  async upsertSenderBindingError(userId, phoneNormalized, campaignRunId, errorCode) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    const rid = Number.parseInt(campaignRunId, 10);
    const err = String(errorCode || 'not_found').trim().slice(0, 255) || 'not_found';
    if (!Number.isFinite(uid) || uid <= 0 || !phone || !Number.isFinite(rid) || rid <= 0) return;
    await db.query(
      `INSERT INTO zalo_personal_sender_bindings (
         id_user, id_campaign_run, phone_normalized, id_zalo_account, error, updated_at
       )
       VALUES ($1, $2, $3, NULL, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (id_user, id_campaign_run, phone_normalized)
       DO UPDATE SET
         id_zalo_account = NULL,
         error = EXCLUDED.error,
         updated_at = CURRENT_TIMESTAMP`,
      [uid, rid, phone, err]
    );
  }
}

export default new ZaloCampaignRecipientRepository();
