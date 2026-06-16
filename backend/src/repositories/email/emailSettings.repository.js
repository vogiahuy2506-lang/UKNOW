import db from '../../config/database.js';
import { encryptSmtpSecret } from '../../utils/smtpSecretCrypto.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

class EmailSettingsRepository {
  async getPagedByUser(userId, { page, limit, status, roleCode }) {
    const offset = (page - 1) * limit;
    const isAdmin = isAdminRole(roleCode);
    let query = `
      SELECT es.id, es.name, es.email, es.reply_to, es.smtp_host, es.smtp_port, es.use_tls, es.daily_limit, es.hourly_limit,
             es.daily_sent_count, es.total_sent_count, es.is_verified, es.status, es.created_at, es.updated_at,
             es.brand_domain, es.domain_verification_status, es.domain_verified_at,
             COALESCE(u.full_name, u.username) AS creator_name
      FROM email_settings es
      LEFT JOIN users u ON es.id_user = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin) {
      params.push(userId);
      query += ` AND es.id_user = $${params.length}`;
    }

    if (status) {
      query += ` AND es.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY es.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(
        (() => {
          if (isAdmin) {
            return status
              ? {
                  query: 'SELECT COUNT(*) FROM email_settings WHERE status = $1',
                  params: [status],
                }
              : {
                  query: 'SELECT COUNT(*) FROM email_settings',
                  params: [],
                };
          }
          return status
            ? {
                query: 'SELECT COUNT(*) FROM email_settings WHERE id_user = $1 AND status = $2',
                params: [userId, status],
              }
            : {
                query: 'SELECT COUNT(*) FROM email_settings WHERE id_user = $1',
                params: [userId],
              };
        })().query,
        (() => {
          if (isAdmin) {
            return status ? [status] : [];
          }
          return status ? [userId, status] : [userId];
        })()
      ),
    ]);

    return {
      rows: result.rows,
      total: parseInt(countResult.rows[0]?.count || 0, 10),
    };
  }

  async getById(userId, id, { roleCode } = {}) {
    const isAdmin = isAdminRole(roleCode);
    const result = await db.query(
      isAdmin
        ? 'SELECT * FROM email_settings WHERE id = $1'
        : 'SELECT * FROM email_settings WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  /** Returns brand_domain + domain_verification_status for a setting id. */
  async getDomainVerificationStatus(userId, id, { roleCode } = {}) {
    const isAdmin = isAdminRole(roleCode);
    const result = await db.query(
      isAdmin
        ? 'SELECT brand_domain, domain_verification_status, domain_dns_records, domain_verified_at FROM email_settings WHERE id = $1'
        : 'SELECT brand_domain, domain_verification_status, domain_dns_records, domain_verified_at FROM email_settings WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  /** Update domain verification fields. */
  async updateDomainVerification(id, payload) {
    const { status, dnsRecords, verifiedAt } = payload;
    const result = await db.query(
      `UPDATE email_settings SET
         domain_verification_status = COALESCE($1, domain_verification_status),
         domain_dns_records         = COALESCE($2, domain_dns_records),
         domain_verified_at        = COALESCE($3, domain_verified_at),
         updated_at                = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING brand_domain, domain_verification_status, domain_dns_records, domain_verified_at`,
      [status, dnsRecords ? JSON.stringify(dnsRecords) : null, verifiedAt || null, id]
    );
    return result.rows[0] || null;
  }

  async create(userId, payload) {
    const { name, email, replyTo, smtpHost, smtpPort, smtpUsername, smtpPassword, useTls, dailyLimit, hourlyLimit } =
      payload;
    const encryptedSmtpPassword = encryptSmtpSecret(smtpPassword);
    const brandDomain = String(email || '').split('@')[1]?.toLowerCase() || null;
    // reply_to defaults to the email address for backward compatibility.
    const resolvedReplyTo = replyTo || email;
    const result = await db.query(
      `INSERT INTO email_settings
        (id_user, name, email, reply_to, smtp_host, smtp_port, smtp_username, smtp_password, use_tls, daily_limit, hourly_limit, is_verified, status, brand_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'active', $12)
       RETURNING *`,
      [userId, name, email, resolvedReplyTo, smtpHost, smtpPort, smtpUsername, encryptedSmtpPassword, useTls, dailyLimit, hourlyLimit, brandDomain]
    );
    return result.rows[0];
  }

  async update(userId, id, payload, { roleCode } = {}) {
    const { name, email, replyTo, smtpHost, smtpPort, smtpUsername, smtpPassword, useTls, dailyLimit, hourlyLimit, status } =
      payload;
    const encryptedSmtpPassword = smtpPassword === undefined ? undefined : encryptSmtpSecret(smtpPassword);
    const isAdmin = isAdminRole(roleCode);
    const brandDomain = email ? String(email).split('@')[1]?.toLowerCase() : undefined;
    const result = await db.query(
      `UPDATE email_settings SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        reply_to = COALESCE($3, reply_to),
        smtp_host = COALESCE($4, smtp_host),
        smtp_port = COALESCE($5, smtp_port),
        smtp_username = COALESCE($6, smtp_username),
        smtp_password = COALESCE($7, smtp_password),
        use_tls = COALESCE($8, use_tls),
        daily_limit = COALESCE($9, daily_limit),
        hourly_limit = COALESCE($10, hourly_limit),
        status = COALESCE($11, status),
        brand_domain = COALESCE($12, brand_domain),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $13
         ${isAdmin ? '' : 'AND id_user = $14'}
       RETURNING *`,
      isAdmin
        ? [
            name,
            email,
            replyTo,
            smtpHost,
            smtpPort,
            smtpUsername,
            encryptedSmtpPassword,
            useTls,
            dailyLimit,
            hourlyLimit,
            status,
            brandDomain,
            id,
          ]
        : [
            name,
            email,
            replyTo,
            smtpHost,
            smtpPort,
            smtpUsername,
            encryptedSmtpPassword,
            useTls,
            dailyLimit,
            hourlyLimit,
            status,
            brandDomain,
            id,
            userId,
          ]
    );
    return result.rows[0] || null;
  }

  async delete(userId, id, { roleCode } = {}) {
    const isAdmin = isAdminRole(roleCode);
    const result = await db.query(
      isAdmin
        ? 'DELETE FROM email_settings WHERE id = $1 RETURNING id'
        : 'DELETE FROM email_settings WHERE id = $1 AND id_user = $2 RETURNING id',
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  async getActiveByUser(userId, { roleCode } = {}) {
    const isAdmin = isAdminRole(roleCode);
    const result = await db.query(
      `SELECT id, name, email, reply_to, smtp_host, smtp_port, is_verified, status, brand_domain
       FROM email_settings
       WHERE status = 'active'
       ${isAdmin ? '' : 'AND id_user = $1'}
       ORDER BY name`,
      isAdmin ? [] : [userId]
    );
    return result.rows;
  }

  async getActiveById(userId, id, { roleCode } = {}) {
    const isAdmin = isAdminRole(roleCode);
    const result = await db.query(
      isAdmin
        ? "SELECT * FROM email_settings WHERE id = $1 AND status = 'active'"
        : "SELECT * FROM email_settings WHERE id = $1 AND id_user = $2 AND status = 'active'",
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  async incrementSentCount(id) {
    await db.query(
      'UPDATE email_settings SET daily_sent_count = daily_sent_count + 1, total_sent_count = total_sent_count + 1 WHERE id = $1',
      [id]
    );
  }

  async withTransaction(callback) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findEmailDeliveryStatus(userId, email) {
    const result = await db.query(
      `SELECT email_subscribed, email_hard_bounced
       FROM customers
       WHERE id_user = $1 AND LOWER(email) = $2
       LIMIT 1`,
      [userId, String(email || '').trim().toLowerCase()]
    );
    return result.rows[0] || null;
  }

  async markCustomerHardBounced(userId, email) {
    await db.query(
      `UPDATE customers SET email_hard_bounced = true, updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $1 AND LOWER(email) = $2`,
      [userId, String(email || '').trim().toLowerCase()]
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
         body_html, body_text, status, sent_at, id_node, email_step,
         from_address, reply_to, brand_domain)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'sent', $15, $16, $17, $18, $19, $20)
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
        Number.isFinite(Number.parseInt(payload.idNode, 10)) ? Number.parseInt(payload.idNode, 10) : null,
        Number.isFinite(Number.parseInt(payload.emailStep, 10)) ? Number.parseInt(payload.emailStep, 10) : null,
        payload.fromAddress || null,
        payload.replyTo || null,
        payload.brandDomain || null,
      ]
    );
    return result.rows[0]?.id || null;
  }

  /**
   * Tìm bản ghi email đã gửi thành công cho cùng run + chiến dịch + bước + người nhận.
   * Không lọc theo id_node (giả định một chiến dịch chỉ có một node gửi email trong luồng này).
   * Dùng trước khi gửi SMTP để tránh gửi trùng khi ledger chưa kịp ghi.
   *
   * Luồng hoạt động:
   * 1. Khớp id_run, id_campaign, email_step (1-based), recipient_email (không phân biệt hoa thường).
   * 2. Chỉ coi các trạng thái đã phát đi thực tế (sent / delivered / opened / clicked).
   *
   * @param {object} input
   * @param {number} input.runId
   * @param {number} input.campaignId
   * @param {string} input.recipientEmail email người nhận
   * @param {number} input.emailStep thứ tự bước trong node (1-based)
   * @returns {Promise<{id: number, sent_at: Date, status: string}|null>}
   */
  async findExistingSentCampaignEmail({ runId, campaignId, recipientEmail, emailStep }) {
    const safeRun = Number.parseInt(runId, 10);
    const safeCampaign = Number.parseInt(campaignId, 10);
    const safeStep = Number.parseInt(emailStep, 10);
    const email = String(recipientEmail || '').trim();
    if (!Number.isFinite(safeRun) || !Number.isFinite(safeCampaign) || !Number.isFinite(safeStep) || !email) {
      return null;
    }
    const result = await db.query(
      `SELECT id, sent_at, status
       FROM email_messages
       WHERE id_run = $1
         AND id_campaign = $2
         AND email_step = $3
         AND LOWER(TRIM(recipient_email)) = LOWER(TRIM($4))
         AND status IN ('sent', 'delivered', 'opened', 'clicked')
       ORDER BY id DESC
       LIMIT 1`,
      [safeRun, safeCampaign, safeStep, email]
    );
    return result.rows[0] || null;
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
