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
   * Mark an email_message as bounced with timestamp and bounce reason.
   *
   * @param {string} trackingToken
   * @param {Date} bouncedAt
   * @param {string} bounceReason
   * @returns {Promise<void>}
   */
  async markEmailMessageBounced(trackingToken, bouncedAt, bounceReason) {
    await db.query(
      `UPDATE email_messages
       SET status = 'bounced', bounced_at = $1, bounce_reason = $2
       WHERE tracking_token = $3`,
      [bouncedAt, bounceReason, trackingToken]
    );
  }

  /**
   * Mark a customer as hard-bounced.
   *
   * @param {number} customerId
   * @returns {Promise<void>}
   */
  async markCustomerHardBounced(customerId) {
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
    return result.rows[0] || null;
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
       LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }
}

export default new CampaignEmailSenderRepository();
