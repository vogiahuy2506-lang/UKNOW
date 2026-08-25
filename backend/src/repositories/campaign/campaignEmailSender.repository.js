import db from '../../config/database.js';

class CampaignEmailSenderRepository {
  /**
   * Fetch a customer's subscription and bounce status by email.
   *
   * @param {number} userId
   * @param {string} emailLower lowercase email address
   * @returns {Promise<{id: number, email_subscribed: boolean, email_hard_bounced: boolean}|null>}
   */
  async findCustomerByEmail(userId, emailLower) {
    const result = await db.query(
      'SELECT id, email_subscribed, email_hard_bounced FROM customers WHERE id_user = $1 AND LOWER(email) = $2 LIMIT 1',
      [userId, emailLower]
    );
    return result.rows[0] || null;
  }

  /**
   * Increment daily_sent_count and total_sent_count for an email settings account.
   *
   * @param {number} settingsId
   * @returns {Promise<void>}
   */
  async incrementEmailSettingsSentCount(settingsId) {
    await db.query(
      'UPDATE email_settings SET daily_sent_count = daily_sent_count + 1, total_sent_count = total_sent_count + 1 WHERE id = $1',
      [settingsId]
    );
  }

  /**
   * Mark an email_message as failed with a bounce reason.
   *
   * @param {string} trackingToken
   * @param {string} bounceReason
   * @returns {Promise<void>}
   */
  async markEmailMessageFailed(trackingToken, bounceReason) {
    await db.query(
      `UPDATE email_messages
       SET status = 'failed', bounce_reason = $1
       WHERE tracking_token = $2`,
      [bounceReason, trackingToken]
    );
  }

  /**
   * Mark an email_message as bounced with timestamp, bounce reason, and optional bounce classification.
   *
   * @param {string} trackingToken
   * @param {Date} bouncedAt
   * @param {string} bounceReason
   * @param {object} [options]
   * @param {'hard'|'soft'|null} [options.bounceType]
   * @param {string|null} [options.bounceCode]
   * @param {'smtp'|'dsn'} [options.bounceDetectedVia]
   * @returns {Promise<void>}
   */
  async markEmailMessageBounced(trackingToken, bouncedAt, bounceReason, options = {}) {
    const bounceType = options?.bounceType || null;
    const bounceCode = options?.bounceCode || null;
    const bounceDetectedVia = options?.bounceDetectedVia || 'smtp';

    await db.query(
      `UPDATE email_messages
       SET status = 'bounced',
           bounced_at = $1,
           bounce_reason = $2,
           bounce_type = COALESCE($4, bounce_type),
           bounce_code = COALESCE($5, bounce_code),
           bounce_detected_via = COALESCE($6, bounce_detected_via)
       WHERE tracking_token = $3`,
      [bouncedAt, bounceReason, trackingToken, bounceType, bounceCode, bounceDetectedVia]
    );
  }

  /**
   * Tìm bản ghi email_message theo tracking_token.
   *
   * @param {string} trackingToken
   * @returns {Promise<{ id: number, id_campaign: number|null, id_customer: number|null, id_run: number|null, is_preview: boolean, status: string, recipient_email: string }|null>}
   */
  async findEmailMessageByTrackingToken(trackingToken) {
    if (!trackingToken) return null;
    const result = await db.query(
      `SELECT id, id_campaign, id_customer, id_run, is_preview, status, recipient_email
       FROM email_messages
       WHERE tracking_token = $1`,
      [trackingToken]
    );
    return result.rows[0] || null;
  }

  /**
   * Mark a customer as hard-bounced.
   *
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async markCustomerHardBounced(customerId) {
    if (!customerId) return;
    await db.query(
      'UPDATE customers SET email_hard_bounced = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [customerId]
    );
  }

  /**
   * Fetch an email template by ID.
   *
   * @param {number} templateId
   * @returns {Promise<object|null>}
   */
  async findEmailTemplateById(templateId) {
    const result = await db.query(
      'SELECT * FROM email_templates WHERE id = $1',
      [templateId]
    );
    return result.rows[0] || null;
  }

  /**
   * Fetch active email settings for a user by specific account ID.
   *
   * @param {number} fromEmailId
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findEmailSettingsById(fromEmailId, userId) {
    const result = await db.query(
      "SELECT * FROM email_settings WHERE id = $1 AND id_user = $2 AND status = 'active'",
      [fromEmailId, userId]
    );
    const row = result.rows[0] || null;
    if (!row) return null;
    const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
    if (await resourceIsLocked('email_accounts', row.id)) return null;
    return row;
  }

  /**
   * Fetch the default active email settings for a user.
   *
   * @param {number} userId
   * @returns {Promise<object|null>}
   */
  async findDefaultEmailSettings(userId) {
    const result = await db.query(
      `SELECT * FROM email_settings
       WHERE id_user = $1
         AND status = 'active'
       ORDER BY id ASC`,
      [userId]
    );
    const { resourceIsLocked } = await import('../../utils/topupLockGate.util.js');
    for (const row of result.rows) {
      if (!(await resourceIsLocked('email_accounts', row.id))) return row;
    }
    return null;
  }
}

export default new CampaignEmailSenderRepository();
