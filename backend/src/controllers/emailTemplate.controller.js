import db from '../config/database.js';
import uploadController from './upload.controller.js';
import { isAdminRole } from '../utils/roleScope.util.js';
import { checkUserResourceLimit } from '../utils/userResourceLimit.util.js';

class EmailTemplateController {
  /**
   * Lấy danh sách campaign active đang tham chiếu email template.
   *
   * @param {number|string} userId id user hiện tại
   * @param {number|string} templateId id email template
   * @returns {Promise<Array<{id: number, campaignName: string}>>}
   */
  async getActiveCampaignUsages(userId, templateId) {
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

  /**
   * Lấy danh sách email template của user (phân trang, lọc theo category/search).
   * @param {import('express').Request} req - query: { page?, limit?, category?, search? }
   * @param {import('express').Response} res
   */
  // Lấy danh sách email templates
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const { page = 1, limit = 10, category, search } = req.query;
      const offset = (page - 1) * limit;

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
                OR cn.config::text ~ ('"templateId"\\s*:\\s*"?'
                  || et.id::text || '"?')
                OR cn.config::text ~ ('"emailTemplateId"\\s*:\\s*"?'
                  || et.id::text || '"?')
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

      const result = await db.query(query, params);

      // Count query
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
      const countResult = await db.query(countQuery, countParams);

      res.json({
        success: true,
        data: {
          items: result.rows.map(item => ({
            id: item.id,
            templateName: item.template_name,
            templateCode: item.template_code,
            subject: item.subject,
            category: item.category,
            isActive: item.is_active,
            usageCount: item.usage_count,
            activeUsage: {
              isUsedInActiveCampaign: Boolean(item.is_used_in_active_campaign),
            },
            creatorName: item.creator_name || null,
            createdBy: item.creator_name ? { name: item.creator_name } : null,
            createdAt: item.created_at,
            updatedAt: item.updated_at
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: parseInt(countResult.rows[0].count),
            totalPages: Math.ceil(countResult.rows[0].count / limit)
          }
        }
      });
    } catch (error) {
      console.error('Get email templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ'
      });
    }
  }

  // Lấy chi tiết template
  /**
   * Lấy chi tiết một email template theo ID.
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async getById(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const { id } = req.params;

      const result = await db.query(
        isAdmin
          ? 'SELECT * FROM email_templates WHERE id = $1'
          : 'SELECT * FROM email_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu email'
        });
      }

      const item = result.rows[0];
      const ownerUserId = result.rows[0]?.id_user || userId;
      const activeCampaignUsages = await this.getActiveCampaignUsages(ownerUserId, id);

      res.json({
        success: true,
        data: {
          id: item.id,
          templateName: item.template_name,
          templateCode: item.template_code,
          subject: item.subject,
          bodyHtml: item.body_html,
          bodyText: item.body_text,
          attachments: item.attachments || [],
          variables: item.variables,
          category: item.category,
          isActive: item.is_active,
          usageCount: item.usage_count,
          activeUsage: {
            isUsedInActiveCampaign: activeCampaignUsages.length > 0,
            activeCampaignCount: activeCampaignUsages.length,
            activeCampaigns: activeCampaignUsages,
          },
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }
      });
    } catch (error) {
      console.error('Get email template error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ'
      });
    }
  }

  // Tạo mới template
  /**
   * Tạo mới email template. Nếu có file đính kèm tạm (temp), tự động lưu vào local storage.
   * @param {import('express').Request} req - body: { templateName, subject, bodyHtml?, bodyText?, category?, attachments? }
   * @param {import('express').Response} res
   */
  // Đồng bộ danh sách attachments vào bảng template_files (upsert theo storage_key)
  async syncTemplateFiles(templateId, attachments) {
    for (const att of (attachments || [])) {
      const storageKey = att.key;
      if (!storageKey) continue;
      try {
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
            att.originalName || att.name || '',
            att.displayName || '',
            storageKey,
            att.size || null,
            att.contentType || null,
          ]
        );
      } catch (syncErr) {
        console.warn('syncTemplateFiles warning:', syncErr.message);
      }
    }
  }

  async create(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { templateName, templateCode, subject, bodyHtml, bodyText, tempAttachments, variables, category } = req.body;

      const emailTemplateLimitCheck = await checkUserResourceLimit({
        userId,
        roleCode,
        resourceKey: 'emailTemplates',
      });
      if (!emailTemplateLimitCheck.allowed) {
        return res.status(400).json({
          success: false,
          message: emailTemplateLimitCheck.message,
        });
      }

      const hasBodyHtml = Object.prototype.hasOwnProperty.call(req.body, 'bodyHtml');
      const hasBodyText = Object.prototype.hasOwnProperty.call(req.body, 'bodyText');
      const normalizedBodyHtml = hasBodyHtml && typeof bodyHtml === 'string' && bodyHtml.trim() ? bodyHtml : null;
      const normalizedBodyText = hasBodyText && typeof bodyText === 'string' && bodyText.trim() ? bodyText : null;

      // Xử lý temp attachments - lưu vào local uploads
      let storedAttachments = [];
      if (tempAttachments && tempAttachments.length > 0) {
        try {
          storedAttachments = await uploadController.moveToS3(tempAttachments, userId);
          // Gắn lại displayName từ tempAttachments vào attachment đã lưu
          storedAttachments = storedAttachments.map((savedAtt) => {
            const src = (tempAttachments || []).find((t) => t.tempId === savedAtt.tempId);
            return { ...savedAtt, displayName: src?.displayName || '' };
          });
        } catch (uploadError) {
          console.error('Error saving attachments to local storage:', uploadError);
          return res.status(500).json({
            success: false,
            message: 'Lỗi upload file đính kèm'
          });
        }
      }

      const result = await db.query(
        `INSERT INTO email_templates (id_user, template_name, template_code, subject, body_html, body_text, attachments, variables, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          userId,
          templateName,
          templateCode,
          subject,
          normalizedBodyHtml,
          normalizedBodyText,
          JSON.stringify(storedAttachments),
          JSON.stringify(variables || []),
          category
        ]
      );

      const item = result.rows[0];

      // Đồng bộ template_files
      await this.syncTemplateFiles(item.id, storedAttachments);

      res.status(201).json({
        success: true,
        message: 'Tạo mẫu email thành công',
        data: {
          id: item.id,
          templateName: item.template_name,
          templateCode: item.template_code,
          subject: item.subject,
          category: item.category,
          isActive: item.is_active,
          attachments: storedAttachments
        }
      });
    } catch (error) {
      console.error('Create email template error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ'
      });
    }
  }

  // Cập nhật template
  /**
   * Cập nhật email template. Xử lý thêm/xóa attachments và lưu local.
   * @param {import('express').Request} req - params: { id }, body: { templateName?, subject?, bodyHtml?, bodyText?, category?, attachments?, deleteAttachments? }
   * @param {import('express').Response} res
   */
  async update(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const { id } = req.params;
      const { 
        templateName, 
        templateCode, 
        subject, 
        bodyHtml, 
        bodyText, 
        tempAttachments, 
        attachments, 
        deletedAttachments, 
        variables, 
        category, 
        isActive 
      } = req.body;

      const hasBodyHtml = Object.prototype.hasOwnProperty.call(req.body, 'bodyHtml');
      const hasBodyText = Object.prototype.hasOwnProperty.call(req.body, 'bodyText');
      const normalizedBodyHtml = hasBodyHtml && typeof bodyHtml === 'string' && bodyHtml.trim() ? bodyHtml : null;
      const normalizedBodyText = hasBodyText && typeof bodyText === 'string' && bodyText.trim() ? bodyText : null;

      // Kiểm tra template tồn tại và lấy current attachments
      const existing = await db.query(
        isAdmin
          ? 'SELECT id, attachments, id_user FROM email_templates WHERE id = $1'
          : 'SELECT id, attachments, id_user FROM email_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu email'
        });
      }
      const templateOwnerUserId = existing.rows[0].id_user || userId;

      const currentAttachments = Array.isArray(existing.rows[0].attachments)
        ? existing.rows[0].attachments
        : [];

      const resolveAttachmentKey = (att) => {
        return uploadController.normalizeStorageKey(att);
      };

      const incomingAttachments = Array.isArray(attachments) ? attachments : null;
      let finalAttachments = incomingAttachments ? [...incomingAttachments] : [...currentAttachments];

      const deletedKeys = new Set();
      if (Array.isArray(deletedAttachments)) {
        deletedAttachments.forEach((item) => {
          const key = resolveAttachmentKey(item);
          if (key) deletedKeys.add(key);
        });
      }

      if (incomingAttachments) {
        const currentKeys = new Set(
          currentAttachments.map(resolveAttachmentKey).filter(Boolean)
        );
        const incomingKeys = new Set(
          incomingAttachments.map(resolveAttachmentKey).filter(Boolean)
        );
        for (const key of currentKeys) {
          if (!incomingKeys.has(key)) {
            deletedKeys.add(key);
          }
        }
      }

      // Xử lý xóa files local đã bị remove
      if (deletedKeys.size > 0) {
        try {
          const keysToDelete = Array.from(deletedKeys);
          await uploadController.deleteFromS3(keysToDelete);
          // Xóa files khỏi finalAttachments
          finalAttachments = finalAttachments.filter(att => {
            const key = resolveAttachmentKey(att);
            return !key || !deletedKeys.has(key);
          });
        } catch (error) {
          console.error('Error deleting specific local attachments:', error);
          // Tiếp tục thực hiện, chỉ log error
        }
      }

      // Xử lý new temp attachments - lưu vào local uploads
      if (tempAttachments && tempAttachments.length > 0) {
        try {
          let storedAttachments = await uploadController.moveToS3(tempAttachments, templateOwnerUserId);
          // Gắn lại displayName từ tempAttachments
          storedAttachments = storedAttachments.map((savedAtt) => {
            const src = (tempAttachments || []).find((t) => t.tempId === savedAtt.tempId);
            return { ...savedAtt, displayName: src?.displayName || '' };
          });
          finalAttachments = finalAttachments.concat(storedAttachments);
        } catch (uploadError) {
          console.error('Error uploading new attachments:', uploadError);
          return res.status(500).json({
            success: false,
            message: 'Lỗi xử lý file đính kèm mới'
          });
        }
      }

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
              normalizedBodyHtml,
              hasBodyText,
              normalizedBodyText,
              JSON.stringify(finalAttachments),
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
              normalizedBodyHtml,
              hasBodyText,
              normalizedBodyText,
              JSON.stringify(finalAttachments),
              variables ? JSON.stringify(variables) : null,
              category,
              isActive,
              id,
              userId,
            ]
      );

      const item = result.rows[0];

      // Đồng bộ template_files
      await this.syncTemplateFiles(item.id, finalAttachments);

      res.json({
        success: true,
        message: 'Cập nhật mẫu email thành công',
        data: {
          id: item.id,
          templateName: item.template_name,
          templateCode: item.template_code,
          subject: item.subject,
          category: item.category,
          isActive: item.is_active,
          attachments: finalAttachments
        }
      });
    } catch (error) {
      console.error('Update email template error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ'
      });
    }
  }

  // Xóa template
  /**
   * Xóa email template và các file đính kèm local liên quan.
   * @param {import('express').Request} req - params: { id }
   * @param {import('express').Response} res
   */
  async delete(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const { id } = req.params;

      // Lấy attachments trước khi delete
      const templateResult = await db.query(
        isAdmin
          ? 'SELECT attachments FROM email_templates WHERE id = $1'
          : 'SELECT attachments FROM email_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );

      if (templateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu email'
        });
      }

      const attachments = templateResult.rows[0].attachments;

      // Delete template từ database
      await db.query(
        isAdmin
          ? 'DELETE FROM email_templates WHERE id = $1'
          : 'DELETE FROM email_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );

      // Xóa files local nếu có attachments
      if (attachments && attachments.length > 0) {
        try {
          const fileKeys = attachments
            .map((att) => uploadController.normalizeStorageKey(att))
            .filter(Boolean);
          if (fileKeys.length > 0) {
            await uploadController.deleteFromS3(fileKeys);
          }
        } catch (s3Error) {
          // Log error nhưng không fail vì template đã được xóa
          console.error('Error deleting local files for template:', id, s3Error);
        }
      }

      res.json({
        success: true,
        message: 'Xóa mẫu email thành công'
      });
    } catch (error) {
      console.error('Delete email template error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi máy chủ'
      });
    }
  }
}

export default new EmailTemplateController();
