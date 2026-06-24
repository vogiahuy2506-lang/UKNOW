import uploadController from './upload.controller.js';
import emailTemplateRepository from '../repositories/email/emailTemplate.repository.js';
import db from '../config/database.js';
import { isAdminRole } from '../utils/roleScope.util.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../utils/userResourceLimit.util.js';

class EmailTemplateController {
  /**
   * Lấy danh sách campaign active đang tham chiếu email template.
   *
   * @param {number|string} userId id user hiện tại
   * @param {number|string} templateId id email template
   * @returns {Promise<Array<{id: number, campaignName: string}>>}
   */
  async getActiveCampaignUsages(userId, templateId) {
    return emailTemplateRepository.findActiveCampaignUsages(userId, templateId);
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
      const isAdmin = isAdminRole(req.user?.role);
      const { page = 1, limit = 10, category, search } = req.query;
      const offset = (page - 1) * limit;

      const { rows, total } = await emailTemplateRepository.list({
        userId,
        isAdmin,
        category,
        search,
        limit,
        offset,
      });

      res.json({
        success: true,
        data: {
          items: rows.map(item => ({
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
            total,
            totalPages: Math.ceil(total / limit)
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
      const isAdmin = isAdminRole(req.user?.role);
      const { id } = req.params;

      const item = await emailTemplateRepository.findById({ id, userId, isAdmin });

      if (!item) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu email'
        });
      }

      const ownerUserId = item.id_user || userId;
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
        await emailTemplateRepository.syncTemplateFile(templateId, att);
      } catch (syncErr) {
        console.warn('syncTemplateFiles warning:', syncErr.message);
      }
    }
  }

  async create(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user?.role;
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
          limitReached: true,
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

      const item = await (async () => {
        const client = await db.getClient();
        try {
          await client.query('BEGIN');
          await enforceResourceLimitTx(client, { userId, roleCode, resourceKey: 'emailTemplates' });
          const created = await emailTemplateRepository.create({
            userId,
            templateName,
            templateCode,
            subject,
            bodyHtml: normalizedBodyHtml,
            bodyText: normalizedBodyText,
            attachments: storedAttachments,
            variables,
            category,
          }, client);
          for (const attachment of storedAttachments) {
            await emailTemplateRepository.syncTemplateFile(created.id, attachment, client);
          }
          await client.query('COMMIT');
          return created;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      })();

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
      if (error?.code === 'RESOURCE_LIMIT_EXCEEDED' || error?.limitReached) {
        return res.status(error.statusCode || 403).json({
          success: false,
          message: error.message,
          limitReached: true,
        });
      }
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
      const isAdmin = isAdminRole(req.user?.role);
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
      const existing = await emailTemplateRepository.findForWrite({ id, userId, isAdmin });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu email'
        });
      }
      const templateOwnerUserId = existing.id_user || userId;

      const currentAttachments = Array.isArray(existing.attachments)
        ? existing.attachments
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

      const item = await emailTemplateRepository.update({
        id,
        userId,
        isAdmin,
        templateName,
        templateCode,
        subject,
        hasBodyHtml,
        bodyHtml: normalizedBodyHtml,
        hasBodyText,
        bodyText: normalizedBodyText,
        attachments: finalAttachments,
        variables,
        category,
        isActive,
      });

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
      const isAdmin = isAdminRole(req.user?.role);
      const { id } = req.params;

      // Lấy attachments trước khi delete
      const template = await emailTemplateRepository.findForWrite({ id, userId, isAdmin });

      if (!template) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu email'
        });
      }

      const attachments = template.attachments;

      // Delete template từ database
      await emailTemplateRepository.delete({ id, userId, isAdmin });

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
