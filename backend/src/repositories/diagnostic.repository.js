import db from '../config/database.js';

class DiagnosticRepository {
  async createRun({ channel, accountId, messageText, interMessageDelayMs, recipients, createdBy }) {
    const { rows } = await db.query(
      `INSERT INTO diagnostic_runs
         (channel, account_id, message_text, inter_message_delay_ms, total_count, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [channel, accountId || null, messageText, interMessageDelayMs, recipients.length, createdBy]
    );
    return rows[0];
  }

  async bulkCreateMessages(runId, recipients) {
    if (!recipients.length) return;
    const values = recipients
      .map((r, i) => `($1, ${i + 1}, $${i + 2})`)
      .join(', ');
    await db.query(
      `INSERT INTO diagnostic_messages (run_id, seq, recipient) VALUES ${values}`,
      [runId, ...recipients]
    );
  }

  async findRun(runId) {
    const { rows } = await db.query(
      `SELECT dr.*, u.username AS created_by_username,
              zs.display_name AS account_display_name
       FROM diagnostic_runs dr
       LEFT JOIN users u ON u.id = dr.created_by
       LEFT JOIN zalo_settings zs ON zs.id = dr.account_id
       WHERE dr.id = $1`,
      [runId]
    );
    return rows[0] || null;
  }

  async findRunMessages(runId) {
    const { rows } = await db.query(
      `SELECT * FROM diagnostic_messages WHERE run_id = $1 ORDER BY seq ASC`,
      [runId]
    );
    return rows;
  }

  async updateMessage(runId, seq, { status, sentAt, delayMs, errorCode, errorMessage }) {
    await db.query(
      `UPDATE diagnostic_messages
       SET status = $1, sent_at = $2, delay_ms = $3, error_code = $4, error_message = $5
       WHERE run_id = $6 AND seq = $7`,
      [status, sentAt || null, delayMs ?? null, errorCode || null, errorMessage || null, runId, seq]
    );
  }

  async incrementSentCount(runId) {
    await db.query(
      `UPDATE diagnostic_runs SET sent_count = sent_count + 1 WHERE id = $1`,
      [runId]
    );
  }

  async incrementFailedCount(runId) {
    await db.query(
      `UPDATE diagnostic_runs SET failed_count = failed_count + 1 WHERE id = $1`,
      [runId]
    );
  }

  async completeRun(runId, status = 'completed') {
    await db.query(
      `UPDATE diagnostic_runs SET status = $1, completed_at = NOW() WHERE id = $2`,
      [status, runId]
    );
  }

  async listZaloCampaigns(limit = 100) {
    const { rows } = await db.query(
      `SELECT c.id, c.campaign_name, c.campaign_type, c.status,
              u.full_name AS owner_name, u.email AS owner_email
       FROM campaigns c
       JOIN users u ON u.id = c.id_user
       WHERE c.campaign_type = 'zalo'
       ORDER BY c.id DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async getCampaignPrefill(campaignId) {
    const { rows: nodeRows } = await db.query(
      `SELECT config->>'zaloAccountId' AS zalo_account_id,
              COALESCE(NULLIF(config->>'zaloMessage', ''), NULLIF(config->>'message', '')) AS message_text
       FROM campaign_nodes
       WHERE id_campaign = $1
         AND node_subtype = 'send_zalo_personal'
       LIMIT 1`,
      [campaignId]
    );

    const { rows: phoneRows } = await db.query(
      `SELECT DISTINCT COALESCE(NULLIF(c.zalo_phone, ''), NULLIF(c.phone, '')) AS phone
       FROM campaign_customers cc
       JOIN customers c ON c.id = cc.id_customer
       WHERE cc.id_campaign = $1
         AND COALESCE(NULLIF(c.zalo_phone, ''), NULLIF(c.phone, '')) IS NOT NULL
       ORDER BY phone
       LIMIT 20`,
      [campaignId]
    );

    return {
      node: nodeRows[0] || null,
      phones: phoneRows.map((r) => r.phone),
    };
  }

  async listRecentRuns(limit = 10) {
    const { rows } = await db.query(
      `SELECT dr.id, dr.channel, dr.status, dr.total_count, dr.sent_count, dr.failed_count,
              dr.inter_message_delay_ms, dr.created_at, dr.completed_at,
              u.username AS created_by_username,
              zs.display_name AS account_display_name
       FROM diagnostic_runs dr
       LEFT JOIN users u ON u.id = dr.created_by
       LEFT JOIN zalo_settings zs ON zs.id = dr.account_id
       ORDER BY dr.created_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }
}

export default new DiagnosticRepository();
