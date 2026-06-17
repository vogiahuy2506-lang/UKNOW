import db from '../config/database.js';

const MESSAGE_PATCH_COLUMNS = {
  status: 'status',
  sentAt: 'sent_at',
  delayMs: 'delay_ms',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  waitMs: 'wait_ms',
  waitReason: 'wait_reason',
  lookupMs: 'lookup_ms',
  sendMs: 'send_ms',
  attempts: 'attempts',
  errorCategory: 'error_category',
  resolvedUid: 'resolved_uid',
  zaloName: 'zalo_name',
};

class DiagnosticRepository {
  async createRun({
    channel,
    accountId,
    messageText,
    interMessageDelayMs,
    recipients,
    createdBy,
    mode = 'fast',
    policySnapshot = null,
  }) {
    const { rows } = await db.query(
      `INSERT INTO diagnostic_runs
         (channel, account_id, message_text, inter_message_delay_ms, total_count, created_by, mode, policy_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        channel,
        accountId || null,
        messageText,
        interMessageDelayMs,
        recipients.length,
        createdBy,
        mode,
        policySnapshot ? JSON.stringify(policySnapshot) : null,
      ]
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

  async updateMessage(runId, seq, patch = {}) {
    const entries = Object.entries(patch).filter(([key]) => MESSAGE_PATCH_COLUMNS[key]);
    if (!entries.length) return;

    const setClauses = entries.map(([key], index) => `${MESSAGE_PATCH_COLUMNS[key]} = $${index + 1}`);
    const values = entries.map(([, value]) => value ?? null);

    await db.query(
      `UPDATE diagnostic_messages
       SET ${setClauses.join(', ')}
       WHERE run_id = $${values.length + 1} AND seq = $${values.length + 2}`,
      [...values, runId, seq]
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

  async incrementSkippedCount(runId) {
    await db.query(
      `UPDATE diagnostic_runs SET skipped_count = skipped_count + 1 WHERE id = $1`,
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
      `SELECT
         config->>'zaloAccountId' AS zalo_account_id,
         COALESCE(
           NULLIF(config->>'zaloMessage', ''),
           NULLIF(config->>'message', ''),
           (
             SELECT NULLIF(TRIM(COALESCE(zt.body_text, zt.body_html)), '')
             FROM zalo_templates zt
             WHERE zt.id = (
               CAST(NULLIF(TRIM(config->'zaloPersonalTemplateSteps'->0->>'templateId'), '') AS INTEGER)
             )
             LIMIT 1
           )
         ) AS message_text,
         COALESCE(NULLIF(config->>'zaloRecipientPhones', ''), NULLIF(config->>'recipientPhones', '')) AS recipient_phones_raw
       FROM campaign_nodes
       WHERE id_campaign = $1
         AND node_subtype = 'send_zalo_personal'
       LIMIT 1`,
      [campaignId]
    );

    const { rows: sentRows } = await db.query(
      `SELECT DISTINCT recipient_value AS phone
       FROM zalo_messages
       WHERE id_campaign = $1
         AND recipient_type = 'phone'
         AND recipient_value IS NOT NULL
         AND recipient_value <> ''
       ORDER BY phone
       LIMIT 20`,
      [campaignId]
    );

    const { rows: msgRows } = await db.query(
      `SELECT message_text
       FROM zalo_messages
       WHERE id_campaign = $1
         AND message_text IS NOT NULL
         AND message_text <> ''
       LIMIT 1`,
      [campaignId]
    );

    const node = nodeRows[0] || null;

    let phones = sentRows.map((r) => r.phone);
    if (phones.length === 0 && node?.recipient_phones_raw) {
      phones = node.recipient_phones_raw
        .split(/[\n,;]+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 20);
    }

    const messageText = node?.message_text || msgRows[0]?.message_text || '';

    return { node, phones, messageText };
  }

  async listRecentRuns(limit = 10) {
    const { rows } = await db.query(
      `SELECT dr.id, dr.channel, dr.status, dr.total_count, dr.sent_count, dr.failed_count,
              dr.skipped_count, dr.inter_message_delay_ms, dr.mode, dr.created_at, dr.completed_at,
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
