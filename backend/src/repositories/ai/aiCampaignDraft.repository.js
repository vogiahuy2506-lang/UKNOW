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

  async findDefaultEmailSettingId(userId) {
    const { rows } = await db.query(
      `SELECT id FROM email_settings WHERE id_user = $1 AND status = 'active' ORDER BY id ASC LIMIT 1`,
      [userId]
    );
    return rows[0]?.id || null;
  }

  async findDefaultZaloSettingId(userId) {
    const { rows } = await db.query(
      `SELECT id FROM zalo_settings WHERE id_user = $1 AND is_active = true ORDER BY id ASC LIMIT 1`,
      [userId]
    );
    return rows[0]?.id || null;
  }
}

export default new AiCampaignDraftRepository();
