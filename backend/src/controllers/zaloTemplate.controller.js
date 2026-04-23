import db from '../config/database.js';
import uploadController from './upload.controller.js';
import { isAdminRole } from '../utils/roleScope.util.js';
import { checkUserResourceLimit } from '../utils/userResourceLimit.util.js';

class ZaloTemplateController {
  /**
   * Lấy danh sách campaign active đang tham chiếu template Zalo.
   *
   * @param {number|string} userId id user hiện tại
   * @param {number|string} templateId id template Zalo
   * @returns {Promise<Array<{id: number, campaignName: string}>>}
   */
  async getActiveCampaignUsages(userId, templateId) {
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

  buildMissingTableResponse(res) {
    return res.status(500).json({
      success: false,
      message:
        'Bảng zalo_templates chưa tồn tại. Vui lòng chạy file SQL backend/sql/20260301_create_zalo_templates.sql trước khi sử dụng.',
      code: 'ZALO_TEMPLATES_TABLE_MISSING',
    });
  }

  mapTemplateRow(item) {
    return {
      id: item.id,
      templateName: item.template_name,
      templateCode: item.template_code,
      subject: item.subject,
      bodyHtml: item.body_html,
      bodyText: item.body_text,
      attachments: item.attachments || [],
      variables: item.variables || [],
      category: item.category,
      isActive: item.is_active,
      usageCount: item.usage_count,
      activeUsage: {
        isUsedInActiveCampaign: Boolean(item.is_used_in_active_campaign),
      },
      creatorName: item.creator_name || null,
      createdBy: item.creator_name ? { name: item.creator_name } : null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  /**
   * Lấy danh sách template Zalo của user hiện tại.
   *
   * @param {import('express').Request} req query: { page?, limit?, category?, search? }
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getAll(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = Number.parseInt(req.query.limit, 10) || 10;
      const { category, search } = req.query;
      const offset = (page - 1) * limit;

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
                OR cn.config::text ~ ('"templateId"\\s*:\\s*"?'
                  || zt.id::text || '"?')
                OR cn.config::text ~ ('"zaloFriendTemplateId"\\s*:\\s*"?'
                  || zt.id::text || '"?')
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

      const result = await db.query(query, params);

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

      const countResult = await db.query(countQuery, countParams);

      res.json({
        success: true,
        data: {
          items: result.rows.map((item) => this.mapTemplateRow(item)),
          pagination: {
            page,
            limit,
            total: Number.parseInt(countResult.rows[0].count, 10),
            totalPages: Math.ceil(Number.parseInt(countResult.rows[0].count, 10) / limit),
          },
        },
      });
    } catch (error) {
      if (error?.code === '42P01') {
        this.buildMissingTableResponse(res);
        return;
      }
      console.error('Get zalo templates error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể tải danh sách template Zalo',
      });
    }
  }

  /**
   * Lấy chi tiết một template Zalo theo ID.
   *
   * @param {import('express').Request} req params: { id }
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async getById(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const { id } = req.params;
      const result = await db.query(
        isAdmin
          ? 'SELECT * FROM zalo_templates WHERE id = $1'
          : 'SELECT * FROM zalo_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu Zalo',
        });
        return;
      }
      const ownerUserId = result.rows[0]?.id_user || userId;
      const activeCampaignUsages = await this.getActiveCampaignUsages(ownerUserId, id);

      res.json({
        success: true,
        data: {
          ...this.mapTemplateRow(result.rows[0]),
          activeUsage: {
            isUsedInActiveCampaign: activeCampaignUsages.length > 0,
            activeCampaignCount: activeCampaignUsages.length,
            activeCampaigns: activeCampaignUsages,
          },
        },
      });
    } catch (error) {
      if (error?.code === '42P01') {
        this.buildMissingTableResponse(res);
        return;
      }
      console.error('Get zalo template error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể tải chi tiết template Zalo',
      });
    }
  }

  /**
   * Tạo mới template Zalo và xử lý file đính kèm tạm nếu có.
   *
   * @param {import('express').Request} req body: { templateName, subject, bodyText, tempAttachments?, variables?, category? }
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async create(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role_code;
      const { templateName, templateCode, subject, bodyText, tempAttachments, variables, category } = req.body;

      const zaloTemplateLimitCheck = await checkUserResourceLimit({
        userId,
        roleCode,
        resourceKey: 'zaloTemplates',
      });
      if (!zaloTemplateLimitCheck.allowed) {
        res.status(400).json({
          success: false,
          message: zaloTemplateLimitCheck.message,
        });
        return;
      }

      const normalizedBodyText = typeof bodyText === 'string' && bodyText.trim() ? bodyText : null;
      let storedAttachments = [];

      if (Array.isArray(tempAttachments) && tempAttachments.length > 0) {
        try {
          storedAttachments = await uploadController.moveToS3(tempAttachments, userId);
          storedAttachments = storedAttachments.map((savedAtt) => {
            const source = tempAttachments.find((item) => item.tempId === savedAtt.tempId);
            return { ...savedAtt, displayName: source?.displayName || '' };
          });
        } catch (uploadError) {
          console.error('Create zalo template upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Lỗi upload file đính kèm',
          });
          return;
        }
      }

      const result = await db.query(
        `INSERT INTO zalo_templates (id_user, template_name, template_code, subject, body_text, attachments, variables, category)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userId,
          templateName,
          templateCode || null,
          subject,
          normalizedBodyText,
          JSON.stringify(storedAttachments),
          JSON.stringify(Array.isArray(variables) ? variables : []),
          category || null,
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Tạo mẫu Zalo thành công',
        data: this.mapTemplateRow(result.rows[0]),
      });
    } catch (error) {
      if (error?.code === '42P01') {
        this.buildMissingTableResponse(res);
        return;
      }
      console.error('Create zalo template error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể tạo template Zalo',
      });
    }
  }

  /**
   * Cập nhật template Zalo và xử lý thêm/xóa attachment.
   *
   * @param {import('express').Request} req params: { id }, body: { templateName?, subject?, bodyText?, attachments?, tempAttachments?, deletedAttachments? }
   * @param {import('express').Response} res
   * @returns {Promise<void>}
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
        bodyText,
        tempAttachments,
        attachments,
        deletedAttachments,
        variables,
        category,
        isActive,
      } = req.body;

      const hasBodyText = Object.prototype.hasOwnProperty.call(req.body, 'bodyText');
      const normalizedBodyText = hasBodyText && typeof bodyText === 'string' && bodyText.trim() ? bodyText : null;

      const existing = await db.query(
        isAdmin
          ? 'SELECT id, attachments, id_user FROM zalo_templates WHERE id = $1'
          : 'SELECT id, attachments, id_user FROM zalo_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );
      if (existing.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu Zalo',
        });
        return;
      }
      const templateOwnerUserId = existing.rows[0].id_user || userId;

      const currentAttachments = Array.isArray(existing.rows[0].attachments) ? existing.rows[0].attachments : [];
      const incomingAttachments = Array.isArray(attachments) ? attachments : null;
      let finalAttachments = incomingAttachments ? [...incomingAttachments] : [...currentAttachments];

      const resolveAttachmentKey = (att) => {
        return uploadController.normalizeStorageKey(att);
      };

      const deletedKeys = new Set();
      if (Array.isArray(deletedAttachments)) {
        deletedAttachments.forEach((item) => {
          const key = resolveAttachmentKey(item);
          if (key) deletedKeys.add(key);
        });
      }

      if (incomingAttachments) {
        const currentKeys = new Set(currentAttachments.map(resolveAttachmentKey).filter(Boolean));
        const incomingKeys = new Set(incomingAttachments.map(resolveAttachmentKey).filter(Boolean));
        for (const key of currentKeys) {
          if (!incomingKeys.has(key)) {
            deletedKeys.add(key);
          }
        }
      }

      if (deletedKeys.size > 0) {
        try {
          await uploadController.deleteFromS3(Array.from(deletedKeys));
          finalAttachments = finalAttachments.filter((att) => {
            const key = resolveAttachmentKey(att);
            return !key || !deletedKeys.has(key);
          });
        } catch (deleteError) {
          console.error('Delete zalo template attachments warning:', deleteError);
        }
      }

      if (Array.isArray(tempAttachments) && tempAttachments.length > 0) {
        try {
          let storedAttachments = await uploadController.moveToS3(tempAttachments, templateOwnerUserId);
          storedAttachments = storedAttachments.map((savedAtt) => {
            const source = tempAttachments.find((item) => item.tempId === savedAtt.tempId);
            return { ...savedAtt, displayName: source?.displayName || '' };
          });
          finalAttachments = finalAttachments.concat(storedAttachments);
        } catch (uploadError) {
          console.error('Update zalo template upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Lỗi xử lý file đính kèm mới',
          });
          return;
        }
      }

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
              normalizedBodyText,
              JSON.stringify(finalAttachments),
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
              normalizedBodyText,
              JSON.stringify(finalAttachments),
              Array.isArray(variables) ? JSON.stringify(variables) : null,
              category || null,
              typeof isActive === 'boolean' ? isActive : null,
              id,
              userId,
            ]
      );

      res.json({
        success: true,
        message: 'Cập nhật mẫu Zalo thành công',
        data: this.mapTemplateRow(result.rows[0]),
      });
    } catch (error) {
      if (error?.code === '42P01') {
        this.buildMissingTableResponse(res);
        return;
      }
      console.error('Update zalo template error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể cập nhật template Zalo',
      });
    }
  }

  /**
   * Xóa template Zalo và dọn file đính kèm liên quan.
   *
   * @param {import('express').Request} req params: { id }
   * @param {import('express').Response} res
   * @returns {Promise<void>}
   */
  async delete(req, res) {
    try {
      const userId = req.user.id;
      const isAdmin = isAdminRole(req.user?.role_code);
      const { id } = req.params;

      const templateResult = await db.query(
        isAdmin
          ? 'SELECT attachments FROM zalo_templates WHERE id = $1'
          : 'SELECT attachments FROM zalo_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );
      if (templateResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu Zalo',
        });
        return;
      }

      await db.query(
        isAdmin
          ? 'DELETE FROM zalo_templates WHERE id = $1'
          : 'DELETE FROM zalo_templates WHERE id = $1 AND id_user = $2',
        isAdmin ? [id] : [id, userId]
      );

      const attachments = Array.isArray(templateResult.rows[0].attachments) ? templateResult.rows[0].attachments : [];
      const fileKeys = attachments.map((att) => uploadController.normalizeStorageKey(att)).filter(Boolean);
      if (fileKeys.length > 0) {
        try {
          await uploadController.deleteFromS3(fileKeys);
        } catch (deleteError) {
          console.error('Delete zalo template S3 warning:', deleteError);
        }
      }

      res.json({
        success: true,
        message: 'Xóa mẫu Zalo thành công',
      });
    } catch (error) {
      if (error?.code === '42P01') {
        this.buildMissingTableResponse(res);
        return;
      }
      console.error('Delete zalo template error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể xóa template Zalo',
      });
    }
  }
}

export default new ZaloTemplateController();
