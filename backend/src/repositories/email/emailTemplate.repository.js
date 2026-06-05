import db from '../../config/database.js';

class EmailTemplateRepository {
  async findActiveCampaignUsages(userId, templateId) {
    const templateIdNum = Number.parseInt(templateId, 10);
    if (!Number.isFinite(templateIdNum)) return [];

    const templateIdRegex = `"templateId"\\s*:\\s*"?${templateIdNum}"?`;
    const emailTemplateIdRegex = `"emailTemplateId"\\s*:\\s*"?${templateIdNum}"?`;
    const result = await db.query(
      `SELECT DISTINCT c.id, c.campaign_name
       FROM campaigns c
       INNER JOIN campaign_nodes cn ON cn.id_campaign = c.id
       WHERE c.id_user = $1
         AND c.status = 'active'
         AND cn.node_subtype = 'send_email'
         AND (
           cn.id_email_template = $2
           OR cn.config::text ~ $3
           OR cn.config::text ~ $4
         )
       ORDER BY c.id DESC
       LIMIT 10`,
      [userId, templateIdNum, templateIdRegex, emailTemplateIdRegex]
    );

    return result.rows.map((item) => ({
      id: item.id,
      campaignName: item.campaign_name,
    }));
  }

  async list({ userId, isAdmin, category, search, limit, offset }) {
    let query = `
      SELECT
        et.id,
        et.template_name,
        et.template_code,
        et.subject,
        et.category,
        et.is_active,
        et.usage_count,
        et.created_at,
        et.updated_at,
        COALESCE(u.full_name, u.username) AS creator_name,
        EXISTS (
          SELECT 1
          FROM campaigns c
          INNER JOIN campaign_nodes cn ON cn.id_campaign = c.id
          WHERE c.id_user = et.id_user
            AND c.status = 'active'
            AND cn.node_subtype = 'send_email'
            AND (
              cn.id_email_template = et.id
              OR cn.config::text ~ ('"templateId"\\s*:\\s*"?' || et.id::text || '"?')
              OR cn.config::text ~ ('"emailTemplateId"\\s*:\\s*"?' || et.id::text || '"?')
            )
        ) AS is_used_in_active_campaign
      FROM email_templates et
      LEFT JOIN users u ON et.id_user = u.id
      WHERE 1 = 1
    `;
    const params = [];

    if (!isAdmin) {
      params.push(userId);
      query += ` AND et.id_user = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (template_name ILIKE $${params.length} OR subject ILIKE $${params.length})`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    let countQuery = 'SELECT COUNT(*) FROM email_templates WHERE 1 = 1';
    const countParams = [];
    if (!isAdmin) {
      countParams.push(userId);
      countQuery += ` AND id_user = $${countParams.length}`;
    }
    if (category) {
      countParams.push(category);
      countQuery += ` AND category = $${countParams.length}`;
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (template_name ILIKE $${countParams.length} OR subject ILIKE $${countParams.length})`;
    }

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);

    return {
      rows: result.rows,
      total: Number.parseInt(countResult.rows[0].count, 10),
    };
  }

  async findById({ id, userId, isAdmin }) {
    const result = await db.query(
      isAdmin
        ? 'SELECT * FROM email_templates WHERE id = $1'
        : 'SELECT * FROM email_templates WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  async create({ userId, templateName, templateCode, subject, bodyHtml, bodyText, attachments, variables, category }) {
    const result = await db.query(
      `INSERT INTO email_templates (id_user, template_name, template_code, subject, body_html, body_text, attachments, variables, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        templateName,
        templateCode,
        subject,
        bodyHtml,
        bodyText,
        JSON.stringify(attachments),
        JSON.stringify(variables || []),
        category,
      ]
    );
    return result.rows[0];
  }

  async syncTemplateFile(templateId, attachment) {
    await db.query(
      `INSERT INTO template_files (template_id, original_name, display_name, storage_key, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (storage_key) DO UPDATE SET
         template_id  = EXCLUDED.template_id,
         display_name = EXCLUDED.display_name,
         original_name = EXCLUDED.original_name,
         updated_at   = CURRENT_TIMESTAMP`,
      [
        templateId,
        attachment.originalName || attachment.name || '',
        attachment.displayName || '',
        attachment.key,
        attachment.size || null,
        attachment.contentType || null,
      ]
    );
  }

  async findForWrite({ id, userId, isAdmin }) {
    const result = await db.query(
      isAdmin
        ? 'SELECT id, attachments, id_user FROM email_templates WHERE id = $1'
        : 'SELECT id, attachments, id_user FROM email_templates WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  async update({
    id,
    userId,
    isAdmin,
    templateName,
    templateCode,
    subject,
    hasBodyHtml,
    bodyHtml,
    hasBodyText,
    bodyText,
    attachments,
    variables,
    category,
    isActive,
  }) {
    const result = await db.query(
      `UPDATE email_templates SET
        template_name = COALESCE($1, template_name),
        template_code = COALESCE($2, template_code),
        subject = COALESCE($3, subject),
        body_html = CASE WHEN $4 THEN $5 ELSE body_html END,
        body_text = CASE WHEN $6 THEN $7 ELSE body_text END,
        attachments = $8,
        variables = COALESCE($9, variables),
        category = COALESCE($10, category),
        is_active = COALESCE($11, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
         ${isAdmin ? '' : 'AND id_user = $13'}
       RETURNING *`,
      isAdmin
        ? [
            templateName,
            templateCode,
            subject,
            hasBodyHtml,
            bodyHtml,
            hasBodyText,
            bodyText,
            JSON.stringify(attachments),
            variables ? JSON.stringify(variables) : null,
            category,
            isActive,
            id,
          ]
        : [
            templateName,
            templateCode,
            subject,
            hasBodyHtml,
            bodyHtml,
            hasBodyText,
            bodyText,
            JSON.stringify(attachments),
            variables ? JSON.stringify(variables) : null,
            category,
            isActive,
            id,
            userId,
          ]
    );
    return result.rows[0] || null;
  }

  async delete({ id, userId, isAdmin }) {
    await db.query(
      isAdmin
        ? 'DELETE FROM email_templates WHERE id = $1'
        : 'DELETE FROM email_templates WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
  }
}

export default new EmailTemplateRepository();
