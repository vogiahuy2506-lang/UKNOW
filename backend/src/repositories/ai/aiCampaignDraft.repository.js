import db from '../../config/database.js';

class AiCampaignDraftRepository {
  async createEmailTemplate({ userId, name, code, subject, bodyHtml }) {
    const { rows } = await db.query(
      `INSERT INTO email_templates (id_user, template_name, template_code, subject, body_html, body_text, attachments, variables, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        userId,
        name,
        code,
        subject,
        bodyHtml,
        '',
        JSON.stringify([]),
        JSON.stringify([]),
        'marketing',
      ]
    );
    return rows[0] || null;
  }

  async createZaloTemplate({ userId, name, code, subject, bodyText }) {
    const { rows } = await db.query(
      `INSERT INTO zalo_templates (id_user, template_name, template_code, subject, body_text, attachments, variables, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        userId,
        name,
        code,
        subject || name,
        bodyText || '',
        JSON.stringify([]),
        JSON.stringify([]),
        'marketing',
      ]
    );
    return rows[0] || null;
  }

  async deleteEmailTemplatesByIds({ userId, ids = [] }) {
    const normalizedIds = ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!userId || normalizedIds.length === 0) return [];
    const { rows } = await db.query(
      `DELETE FROM email_templates
       WHERE id_user = $1 AND id = ANY($2::bigint[])
       RETURNING id`,
      [userId, normalizedIds]
    );
    return rows;
  }

  async deleteZaloTemplatesByIds({ userId, ids = [] }) {
    const normalizedIds = ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!userId || normalizedIds.length === 0) return [];
    const { rows } = await db.query(
      `DELETE FROM zalo_templates
       WHERE id_user = $1 AND id = ANY($2::bigint[])
       RETURNING id`,
      [userId, normalizedIds]
    );
    return rows;
  }

  async findDefaultEmailSettingId(userId) {
    const { rows } = await db.query(
      `SELECT id FROM email_settings
       WHERE id_user = $1 AND status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM topup_locked_resources tlr
           WHERE tlr.resource_key = 'email_accounts' AND tlr.resource_id = email_settings.id
         )
       ORDER BY id ASC LIMIT 1`,
      [userId]
    );
    return rows[0]?.id || null;
  }

  async findDefaultZaloSettingId(userId) {
    const { rows } = await db.query(
      `SELECT id FROM zalo_settings
       WHERE id_user = $1 AND is_active = true AND status = 'connected'
         AND NOT EXISTS (
           SELECT 1 FROM topup_locked_resources tlr
           WHERE tlr.resource_key = 'zalo_accounts' AND tlr.resource_id = zalo_settings.id
         )
       ORDER BY id ASC LIMIT 1`,
      [userId]
    );
    return rows[0]?.id || null;
  }
}

export default new AiCampaignDraftRepository();
