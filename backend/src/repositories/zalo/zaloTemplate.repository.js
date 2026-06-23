import db from '../../config/database.js';

class ZaloTemplateRepository {
  async findActiveCampaignUsages(userId, templateId) {
    const templateIdNum = Number.parseInt(templateId, 10);
    if (!Number.isFinite(templateIdNum)) return [];

    const templateIdRegex = `"templateId"\\s*:\\s*"?${templateIdNum}"?`;
    const zaloFriendTemplateIdRegex = `"zaloFriendTemplateId"\\s*:\\s*"?${templateIdNum}"?`;
    const result = await db.query(
      `SELECT DISTINCT c.id, c.campaign_name
       FROM campaigns c
       INNER JOIN campaign_nodes cn ON cn.id_campaign = c.id
       WHERE c.id_user = $1
         AND c.status = 'active'
         AND cn.node_subtype IN ('send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request')
         AND (
           cn.id_zalo_template = $2
           OR cn.config::text ~ $3
           OR cn.config::text ~ $4
         )
       ORDER BY c.id DESC
       LIMIT 10`,
      [userId, templateIdNum, templateIdRegex, zaloFriendTemplateIdRegex]
    );

    return result.rows.map((item) => ({
      id: item.id,
      campaignName: item.campaign_name,
    }));
  }

  async list({ userId, isAdmin, category, search, limit, offset }) {
    let query = `
      SELECT
        zt.id,
        zt.template_name,
        zt.template_code,
        zt.subject,
        zt.category,
        zt.is_active,
        zt.usage_count,
        zt.created_at,
        zt.updated_at,
        COALESCE(u.full_name, u.username) AS creator_name,
        EXISTS (
          SELECT 1
          FROM campaigns c
          INNER JOIN campaign_nodes cn ON cn.id_campaign = c.id
          WHERE c.id_user = zt.id_user
            AND c.status = 'active'
            AND cn.node_subtype IN ('send_zalo_personal', 'send_zalo_group', 'send_zalo_friend_request')
            AND (
              cn.id_zalo_template = zt.id
              OR cn.config::text ~ ('"templateId"\\s*:\\s*"?' || zt.id::text || '"?')
              OR cn.config::text ~ ('"zaloFriendTemplateId"\\s*:\\s*"?' || zt.id::text || '"?')
            )
        ) AS is_used_in_active_campaign
      FROM zalo_templates zt
      LEFT JOIN users u ON zt.id_user = u.id
      WHERE 1 = 1
    `;
    const params = [];

    if (!isAdmin) {
      params.push(userId);
      query += ` AND zt.id_user = $${params.length}`;
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

    let countQuery = 'SELECT COUNT(*) FROM zalo_templates WHERE 1 = 1';
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
        ? 'SELECT * FROM zalo_templates WHERE id = $1'
        : 'SELECT * FROM zalo_templates WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
    return result.rows[0] || null;
  }

  async create({ userId, templateName, templateCode, subject, bodyText, attachments, variables, category }, client = null) {
    const queryable = client || db;
    const result = await queryable.query(
      `INSERT INTO zalo_templates (id_user, template_name, template_code, subject, body_text, attachments, variables, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        templateName,
        templateCode || null,
        subject,
        bodyText,
        JSON.stringify(attachments),
        JSON.stringify(Array.isArray(variables) ? variables : []),
        category || null,
      ]
    );
    return result.rows[0];
  }

  async findForWrite({ id, userId, isAdmin }) {
    const result = await db.query(
      isAdmin
        ? 'SELECT id, attachments, id_user FROM zalo_templates WHERE id = $1'
        : 'SELECT id, attachments, id_user FROM zalo_templates WHERE id = $1 AND id_user = $2',
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
    hasBodyText,
    bodyText,
    attachments,
    variables,
    category,
    isActive,
  }) {
    const result = await db.query(
      `UPDATE zalo_templates SET
        template_name = COALESCE($1, template_name),
        template_code = COALESCE($2, template_code),
        subject = COALESCE($3, subject),
        body_text = CASE WHEN $4 THEN $5 ELSE body_text END,
        attachments = $6,
        variables = COALESCE($7, variables),
        category = COALESCE($8, category),
        is_active = COALESCE($9, is_active),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
         ${isAdmin ? '' : 'AND id_user = $11'}
       RETURNING *`,
      isAdmin
        ? [
            templateName || null,
            templateCode || null,
            subject || null,
            hasBodyText,
            bodyText,
            JSON.stringify(attachments),
            Array.isArray(variables) ? JSON.stringify(variables) : null,
            category || null,
            typeof isActive === 'boolean' ? isActive : null,
            id,
          ]
        : [
            templateName || null,
            templateCode || null,
            subject || null,
            hasBodyText,
            bodyText,
            JSON.stringify(attachments),
            Array.isArray(variables) ? JSON.stringify(variables) : null,
            category || null,
            typeof isActive === 'boolean' ? isActive : null,
            id,
            userId,
          ]
    );
    return result.rows[0] || null;
  }

  async delete({ id, userId, isAdmin }) {
    await db.query(
      isAdmin
        ? 'DELETE FROM zalo_templates WHERE id = $1'
        : 'DELETE FROM zalo_templates WHERE id = $1 AND id_user = $2',
      isAdmin ? [id] : [id, userId]
    );
  }
}

export default new ZaloTemplateRepository();
