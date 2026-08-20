import uploadController from './upload.controller.js';
import zaloTemplateRepository from '../repositories/zalo/zaloTemplate.repository.js';
import db from '../config/database.js';
import { isAdminRole } from '../utils/roleScope.util.js';
import { checkUserResourceLimit, enforceResourceLimitTx } from '../utils/userResourceLimit.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import auditService, { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';

class ZaloTemplateController {
  async logMutation(req, action, item) {
    const { actorUserId, workspaceOwnerId } = getWorkspaceContext(req.user);
    return auditService.log({
      userId: actorUserId,
      ownerId: workspaceOwnerId,
      category: 'workspace',
      action,
      entityType: AUDIT_ENTITY_TYPES.ZALO_TEMPLATE,
      entityId: item?.id ?? null,
      details: {
        templateName: item?.template_name || null,
        templateCode: item?.template_code || null,
        category: item?.category || null,
      },
      ipAddress: req.ip,
      userAgent: req.get?.('user-agent') || null,
    });
  }

  /**
   * Lấy danh sách campaign active đang tham chiếu template Zalo.
   *
   * @param {number|string} userId id user hiện tại
   * @param {number|string} templateId id template Zalo
   * @returns {Promise<Array<{id: number, campaignName: string}>>}
   */
  async getActiveCampaignUsages(userId, templateId) {
    return zaloTemplateRepository.findActiveCampaignUsages(userId, templateId);
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
      const { workspaceOwnerId: userId } = getWorkspaceContext(req.user);
      const isAdmin = isAdminRole(req.user?.role);
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = Number.parseInt(req.query.limit, 10) || 10;
      const { category, search } = req.query;
      const offset = (page - 1) * limit;

      const { rows, total } = await zaloTemplateRepository.list({
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
          items: rows.map((item) => this.mapTemplateRow(item)),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
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
      const { workspaceOwnerId: userId } = getWorkspaceContext(req.user);
      const isAdmin = isAdminRole(req.user?.role);
      const { id } = req.params;
      const template = await zaloTemplateRepository.findById({ id, userId, isAdmin });

      if (!template) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu Zalo',
        });
        return;
      }
      const ownerUserId = template.id_user || userId;
      const activeCampaignUsages = await this.getActiveCampaignUsages(ownerUserId, id);

      res.json({
        success: true,
        data: {
          ...this.mapTemplateRow(template),
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
      const { actorUserId, workspaceOwnerId: userId } = getWorkspaceContext(req.user);
      const roleCode = req.user?.role;
      const ownerUserId = userId;
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
          limitReached: true,
        });
        return;
      }

      const normalizedBodyText = typeof bodyText === 'string' && bodyText.trim() ? bodyText : null;
      let storedAttachments = [];
      let template = null;

      if (Array.isArray(tempAttachments) && tempAttachments.length > 0) {
        try {
          await uploadController.promoteTempToStorage(tempAttachments, userId, {
            ownerUserId,
            actorUserId,
            category: 'zalo_template',
            referenceType: 'zalo_template',
            parentMutation: async (client, movedAttachments) => {
              storedAttachments = movedAttachments.map((savedAtt) => {
                const source = tempAttachments.find((item) => item.tempId === savedAtt.tempId);
                return { ...savedAtt, displayName: source?.displayName || '' };
              });
              await enforceResourceLimitTx(client, { userId, roleCode, resourceKey: 'zaloTemplates' });
              template = await zaloTemplateRepository.create({
                userId,
                templateName,
                templateCode,
                subject,
                bodyText: normalizedBodyText,
                attachments: storedAttachments,
                variables,
                category,
              }, client);
              return { referenceId: template.id };
            },
          });
        } catch (uploadError) {
          if (uploadError?.code === 'RESOURCE_LIMIT_EXCEEDED' || uploadError?.limitReached) throw uploadError;
          console.error('Create zalo template upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Lỗi upload file đính kèm',
          });
          return;
        }
      }

      if (!template) template = await (async () => {
        const client = await db.getClient();
        try {
          await client.query('BEGIN');
          await enforceResourceLimitTx(client, { userId, roleCode, resourceKey: 'zaloTemplates' });
          const created = await zaloTemplateRepository.create({
            userId,
            templateName,
            templateCode,
            subject,
            bodyText: normalizedBodyText,
            attachments: storedAttachments,
            variables,
            category,
          }, client);
          await client.query('COMMIT');
          return created;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      })();

      await this.logMutation(req, AUDIT_ACTIONS.ZALO_TEMPLATE_CREATED, template);
      res.status(201).json({
        success: true,
        message: 'Tạo mẫu Zalo thành công',
        data: this.mapTemplateRow(template),
      });
    } catch (error) {
      if (error?.code === '42P01') {
        this.buildMissingTableResponse(res);
        return;
      }
      if (error?.code === 'RESOURCE_LIMIT_EXCEEDED' || error?.limitReached) {
        res.status(error.statusCode || 403).json({
          success: false,
          message: error.message,
          limitReached: true,
        });
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
      const { actorUserId, workspaceOwnerId: userId } = getWorkspaceContext(req.user);
      const isAdmin = isAdminRole(req.user?.role);
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

      const existing = await zaloTemplateRepository.findForWrite({ id, userId, isAdmin });
      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu Zalo',
        });
        return;
      }
      const templateOwnerUserId = existing.id_user || userId;

      const currentAttachments = Array.isArray(existing.attachments) ? existing.attachments : [];
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
        finalAttachments = finalAttachments.filter((att) => {
          const key = resolveAttachmentKey(att);
          return !key || !deletedKeys.has(key);
        });
      }

      let template = null;
      if (Array.isArray(tempAttachments) && tempAttachments.length > 0) {
        try {
          await uploadController.promoteTempToStorage(tempAttachments, templateOwnerUserId, {
            ownerUserId: templateOwnerUserId,
            actorUserId,
            category: 'zalo_template',
            referenceType: 'zalo_template',
            referenceId: id,
            parentMutation: async (client, movedAttachments) => {
              const storedAttachments = movedAttachments.map((savedAtt) => {
                const source = tempAttachments.find((item) => item.tempId === savedAtt.tempId);
                return { ...savedAtt, displayName: source?.displayName || '' };
              });
              finalAttachments = finalAttachments.concat(storedAttachments);
              template = await zaloTemplateRepository.update({
                id,
                userId,
                isAdmin,
                templateName,
                templateCode,
                subject,
                hasBodyText,
                bodyText: normalizedBodyText,
                attachments: finalAttachments,
                variables,
                category,
                isActive,
              }, client);
              if (!template) throw Object.assign(new Error('Không tìm thấy mẫu Zalo'), { statusCode: 404 });
              return { referenceId: template.id };
            },
          });
        } catch (uploadError) {
          console.error('Update zalo template upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Lỗi xử lý file đính kèm mới',
          });
          return;
        }
      }

      if (!template) {
        template = await zaloTemplateRepository.update({
          id,
          userId,
          isAdmin,
          templateName,
          templateCode,
          subject,
          hasBodyText,
          bodyText: normalizedBodyText,
          attachments: finalAttachments,
          variables,
          category,
          isActive,
        });
      }

      if (deletedKeys.size > 0) {
        await uploadController.deleteFromS3(Array.from(deletedKeys));
      }

      await this.logMutation(req, AUDIT_ACTIONS.ZALO_TEMPLATE_UPDATED, template);
      res.json({
        success: true,
        message: 'Cập nhật mẫu Zalo thành công',
        data: this.mapTemplateRow(template),
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
      const { workspaceOwnerId: userId } = getWorkspaceContext(req.user);
      const isAdmin = isAdminRole(req.user?.role);
      const { id } = req.params;

      const template = await zaloTemplateRepository.findForWrite({ id, userId, isAdmin });
      if (!template) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy mẫu Zalo',
        });
        return;
      }

      await zaloTemplateRepository.delete({ id, userId, isAdmin });
      await this.logMutation(req, AUDIT_ACTIONS.ZALO_TEMPLATE_DELETED, template);

      const attachments = Array.isArray(template.attachments) ? template.attachments : [];
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
