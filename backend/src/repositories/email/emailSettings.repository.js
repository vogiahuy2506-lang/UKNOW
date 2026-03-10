import db from '../../config/database.js';
import { encryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';

class EmailSettingsRepository {
  async getPagedByUser(userId, { page, limit, status }) {
    const offset = (page - 1) * limit;
    let query = `
      SELECT id, name, email, smtp_host, smtp_port, use_tls, daily_limit, hourly_limit,
             daily_sent_count, total_sent_count, is_verified, status, created_at, updated_at
      FROM email_settings
      WHERE id_user = $1
    `;
    const params = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(
        status
          ? 'SELECT COUNT(*) FROM email_settings WHERE id_user = $1 AND status = $2'
          : 'SELECT COUNT(*) FROM email_settings WHERE id_user = $1',
        status ? [userId, status] : [userId]
      ),
    ]);

    return {
      rows: result.rows,
      total: parseInt(countResult.rows[0]?.count || 0, 10),
    };
  }

  async getById(userId, id) {
    const result = await db.query('SELECT * FROM email_settings WHERE id = $1 AND id_user = $2', [id, userId]);
    return result.rows[0] || null;
  }

  async create(userId, payload) {
    const { name, email, smtpHost, smtpPort, smtpUsername, smtpPassword, useTls, dailyLimit, hourlyLimit } =
      payload;
    const encryptedSmtpPassword = encryptSmtpSecret(smtpPassword);
    const result = await db.query(
      `INSERT INTO email_settings
        (id_user, name, email, smtp_host, smtp_port, smtp_username, smtp_password, use_tls, daily_limit, hourly_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, name, email, smtpHost, smtpPort, smtpUsername, encryptedSmtpPassword, useTls, dailyLimit, hourlyLimit]
    );
    return result.rows[0];
  }

  async update(userId, id, payload) {
    const { name, email, smtpHost, smtpPort, smtpUsername, smtpPassword, useTls, dailyLimit, hourlyLimit, status } =
      payload;
    const encryptedSmtpPassword = smtpPassword === undefined ? undefined : encryptSmtpSecret(smtpPassword);
    const result = await db.query(
      `UPDATE email_settings SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        smtp_host = COALESCE($3, smtp_host),
        smtp_port = COALESCE($4, smtp_port),
        smtp_username = COALESCE($5, smtp_username),
        smtp_password = COALESCE($6, smtp_password),
        use_tls = COALESCE($7, use_tls),
        daily_limit = COALESCE($8, daily_limit),
        hourly_limit = COALESCE($9, hourly_limit),
        status = COALESCE($10, status),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND id_user = $12
       RETURNING *`,
      [name, email, smtpHost, smtpPort, smtpUsername, encryptedSmtpPassword, useTls, dailyLimit, hourlyLimit, status, id, userId]
    );
    return result.rows[0] || null;
  }

  async delete(userId, id) {
    const result = await db.query('DELETE FROM email_settings WHERE id = $1 AND id_user = $2 RETURNING id', [
      id,
      userId,
    ]);
    return result.rows[0] || null;
  }

  async getActiveByUser(userId) {
    const result = await db.query(
      `SELECT id, name, email, smtp_host, smtp_port, is_verified, status
       FROM email_settings
       WHERE id_user = $1 AND status = 'active'
       ORDER BY name`,
      [userId]
    );
    return result.rows;
  }

  async getActiveById(userId, id) {
    const result = await db.query("SELECT * FROM email_settings WHERE id = $1 AND id_user = $2 AND status = 'active'", [
      id,
      userId,
    ]);
    return result.rows[0] || null;
  }

  async incrementSentCount(id) {
    await db.query(
      'UPDATE email_settings SET daily_sent_count = daily_sent_count + 1, total_sent_count = total_sent_count + 1 WHERE id = $1',
      [id]
    );
  }

  async findCustomerByEmail(client, userId, email) {
    const result = await client.query('SELECT id FROM customers WHERE id_user = $1 AND email = $2 LIMIT 1', [
      userId,
      email,
    ]);
    return result.rows[0] || null;
  }

  async getOwnedCampaign(client, campaignId, userId) {
    const result = await client.query('SELECT id FROM campaigns WHERE id = $1 AND id_user = $2 LIMIT 1', [
      campaignId,
      userId,
    ]);
    return result.rows[0] || null;
  }

  async insertEmailMessage(client, payload) {
    const result = await client.query(
      `INSERT INTO email_messages
        (id_campaign, id_run, id_customer, id_email_template, id_email_setting, message_id,
         tracking_token, recipient_email, recipient_name, sender_email, sender_name, subject,
         body_html, body_text, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'sent', $15)
       RETURNING id`,
      [
        payload.campaignId,
        payload.runId,
        payload.customerId,
        payload.templateId,
        payload.fromEmailId,
        payload.messageId,
        payload.trackingToken,
        payload.recipientEmail,
        null,
        payload.senderEmail,
        payload.senderName,
        payload.subject,
        payload.bodyHtml,
        payload.bodyText,
        payload.sentAt,
      ]
    );
    return result.rows[0]?.id || null;
  }

  async updateCustomerLastEmailSent(client, sentAt, customerId, userId) {
    await client.query('UPDATE customers SET last_email_sent_at = $1 WHERE id = $2 AND id_user = $3', [
      sentAt,
      customerId,
      userId,
    ]);
  }

  async upsertCampaignCustomer(client, campaignId, customerId, sentAt) {
    await client.query(
      `INSERT INTO campaign_customers (
          id_campaign, id_customer, joined_at,
          email_received_count, first_email_sent_at, last_email_sent_at,
          last_activity_at, updated_at
        )
       VALUES ($1, $2, CURRENT_TIMESTAMP, 1, $3, $3, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id_campaign, id_customer)
       DO UPDATE SET
         email_received_count = campaign_customers.email_received_count + 1,
         first_email_sent_at = COALESCE(campaign_customers.first_email_sent_at, EXCLUDED.first_email_sent_at),
         last_email_sent_at = EXCLUDED.last_email_sent_at,
         last_activity_at = EXCLUDED.last_activity_at,
         updated_at = CURRENT_TIMESTAMP`,
      [campaignId, customerId, sentAt]
    );
  }

  async upsertCampaignParticipation(client, customerId, campaignId, runId) {
    await client.query(
      `INSERT INTO campaign_participations (id_customer, id_campaign, id_run, joined_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id_customer, id_campaign)
       DO UPDATE SET id_run = COALESCE(EXCLUDED.id_run, campaign_participations.id_run)`,
      [customerId, campaignId, runId]
    );
  }

  async insertCustomerJourney(client, payload) {
    await client.query(
      `INSERT INTO customer_journey
        (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
       VALUES ($1, $2, $3, 'email_sent', 'email', $4, $5::jsonb, $6)`,
      [payload.customerId, payload.campaignId, payload.runId, payload.emailMessageId, payload.eventData, payload.sentAt]
    );
  }

  async incrementCampaignSent(client, campaignId) {
    await client.query(
      `UPDATE campaigns
       SET total_sent = COALESCE(total_sent, 0) + 1,
           total_customers = (SELECT COUNT(*) FROM campaign_customers WHERE id_campaign = $1),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [campaignId]
    );
  }
}

export default new EmailSettingsRepository();
