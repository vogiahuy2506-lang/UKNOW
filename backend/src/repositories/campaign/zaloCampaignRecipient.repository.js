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
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @returns {Promise<number|null>} id_zalo_account hoặc null
   */
  async getSenderBindingAccountId(userId, phoneNormalized) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    if (!Number.isFinite(uid) || uid <= 0 || !phone) return null;
    const result = await db.query(
      `SELECT id_zalo_account FROM zalo_personal_sender_bindings
       WHERE id_user = $1 AND phone_normalized = $2
       LIMIT 1`,
      [uid, phone]
    );
    const id = result.rows[0]?.id_zalo_account;
    const parsed = Number.parseInt(id, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * @param {number|string} userId
   * @param {string} phoneNormalized
   * @param {number|string} zaloAccountId
   * @returns {Promise<void>}
   */
  async upsertSenderBinding(userId, phoneNormalized, zaloAccountId) {
    const uid = Number.parseInt(userId, 10);
    const phone = String(phoneNormalized || '').trim();
    const aid = Number.parseInt(zaloAccountId, 10);
    if (!Number.isFinite(uid) || uid <= 0 || !phone || !Number.isFinite(aid) || aid <= 0) return;
    await db.query(
      `INSERT INTO zalo_personal_sender_bindings (id_user, phone_normalized, id_zalo_account, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id_user, phone_normalized)
       DO UPDATE SET id_zalo_account = EXCLUDED.id_zalo_account, updated_at = CURRENT_TIMESTAMP`,
      [uid, phone, aid]
    );
  }
}

export default new ZaloCampaignRecipientRepository();
