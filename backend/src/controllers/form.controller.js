import formService from '../services/form.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { ingestFormAsset } from '../services/formAsset.service.js';
import { StorageQuotaExceededError } from '../services/storage/storageQuota.service.js';

/**
 * PR-3a "Bổ sung 15/09": chỉ CHỦ workspace (không phải nhân viên) được đổi paymentConfig —
 * nhân viên đi qua requirePhone bằng SĐT của CHÍNH họ (route /api/forms đã gắn requirePhone
 * cho cả router), không phải một chốt đủ để tin tưởng khi tiền chuyển vào tài khoản do nhân
 * viên tự khai. Kiểm NGAY TRONG controller — trước khi payload.paymentConfig chạm tới service.
 *
 * @param {object} req
 * @param {object} res
 * @param {{workspaceOwnerId: number, contextType: string}} workspaceContext
 * @returns {boolean} true nếu đã trả response 403 (caller phải return ngay)
 */
function rejectPaymentConfigFromEmployee(req, res, workspaceContext) {
  if (workspaceContext.contextType !== 'self' && Object.prototype.hasOwnProperty.call(req.body || {}, 'paymentConfig')) {
    res.status(403).json({
      success: false,
      message: 'Chỉ chủ tài khoản mới được thay đổi cấu hình thanh toán của biểu mẫu',
      code: 'PAYMENT_CONFIG_OWNER_ONLY',
    });
    return true;
  }
  return false;
}

class FormController {
  async list(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const forms = await formService.listForms(workspaceContext.workspaceOwnerId);
      return res.json({
        success: true,
        data: forms,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.list]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải danh sách biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async get(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID biểu mẫu không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      const form = await formService.getForm(id, workspaceContext.workspaceOwnerId);
      return res.json({
        success: true,
        data: form,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.get]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải thông tin biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async create(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      if (rejectPaymentConfigFromEmployee(req, res, workspaceContext)) return;

      const { title, description, fields, settings, theme, bookingConfig, paymentConfig } = req.body || {};

      const form = await formService.createForm({
        workspaceOwnerId: workspaceContext.workspaceOwnerId,
        createdByUserId: workspaceContext.actorUserId,
        title,
        description,
        fields,
        settings,
        theme,
        bookingConfig,
        paymentConfig,
      });

      if (paymentConfig !== undefined) {
        await logWorkspace(
          getWorkspaceAuditContext(req),
          AUDIT_ACTIONS.FORM_PAYMENT_CONFIG_UPDATED,
          AUDIT_ENTITY_TYPES.FORM,
          form.id,
          {
            method: form.paymentConfig?.method || null,
            bankBin: form.paymentConfig?.bankBin || null,
            accountNumberLast4: form.paymentConfig?.accountNumber ? form.paymentConfig.accountNumber.slice(-4) : null,
            momoPhoneLast4: form.paymentConfig?.momoPhone ? form.paymentConfig.momoPhone.slice(-4) : null,
            momoQrAccountLast4: form.paymentConfig?.momoQrAccount ? form.paymentConfig.momoQrAccount.slice(-4) : null,
            enabled: Boolean(form.paymentConfig),
          }
        );
      }

      return res.status(201).json({
        success: true,
        data: form,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.create]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tạo biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async update(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID biểu mẫu không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      if (rejectPaymentConfigFromEmployee(req, res, workspaceContext)) return;

      const form = await formService.updateForm(id, workspaceContext.workspaceOwnerId, req.body || {});

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'paymentConfig')) {
        await logWorkspace(
          getWorkspaceAuditContext(req),
          AUDIT_ACTIONS.FORM_PAYMENT_CONFIG_UPDATED,
          AUDIT_ENTITY_TYPES.FORM,
          form.id,
          {
            method: form.paymentConfig?.method || null,
            bankBin: form.paymentConfig?.bankBin || null,
            accountNumberLast4: form.paymentConfig?.accountNumber ? form.paymentConfig.accountNumber.slice(-4) : null,
            momoPhoneLast4: form.paymentConfig?.momoPhone ? form.paymentConfig.momoPhone.slice(-4) : null,
            momoQrAccountLast4: form.paymentConfig?.momoQrAccount ? form.paymentConfig.momoQrAccount.slice(-4) : null,
            enabled: Boolean(form.paymentConfig),
          }
        );
      }

      return res.json({
        success: true,
        data: form,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.update]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể cập nhật biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * POST /api/forms/assets — tải banner/logo cho biểu mẫu (PR-4a mục 2).
   * Body: { tempId, originalName, contentType, size } — `tempId` lấy từ POST /api/uploads/temp
   * trước đó. Trả `{ storageKey, url, sizeBytes }`; `storageKey` gán vào theme.bannerKey/logoKey
   * ở lượt lưu form kế tiếp (POST/PUT /api/forms), lúc đó khoá mới chuyển 'active'.
   */
  async uploadAsset(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const { tempId, originalName, contentType } = req.body || {};

      const asset = await ingestFormAsset({
        tempId,
        originalName,
        contentType,
        ownerUserId: workspaceContext.workspaceOwnerId,
        actorUserId: workspaceContext.actorUserId,
      });

      return res.json({
        success: true,
        data: {
          storageKey: asset.storageKey,
          url: asset.url,
          sizeBytes: asset.sizeBytes,
        },
      });
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        // PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md PR-4a: 413 theo đúng hợp đồng của nhiệm
        // vụ này — landingPageAdmin.controller.js:448 dùng `error.status || 413` nhưng
        // StorageQuotaExceededError luôn tự set .status=409 trong constructor nên fallback đó
        // thực ra chết (không bao giờ tới 413); ở đây ép thẳng 413 thay vì chép lại chỗ chết đó.
        return res.status(413).json({
          success: false,
          code: error.code || 'STORAGE_QUOTA_EXCEEDED',
          message: error.message,
          data: error.usage,
        });
      }
      const status = error.status || error.statusCode || 500;
      if (status >= 500) console.error('[FormController.uploadAsset]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Lỗi khi tải ảnh lên',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async publish(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID biểu mẫu không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      const isPublished = req.body?.isPublished ?? req.body?.is_published;
      if (typeof isPublished !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái xuất bản (isPublished) phải là giá trị boolean',
          code: 'INVALID_PUBLISH_STATUS',
        });
      }

      const form = await formService.publishForm(id, workspaceContext.workspaceOwnerId, isPublished);
      return res.json({
        success: true,
        data: form,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.publish]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể thay đổi trạng thái xuất bản',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async delete(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID biểu mẫu không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      await formService.deleteForm(id, workspaceContext.workspaceOwnerId);
      return res.json({
        success: true,
        message: 'Đã xóa biểu mẫu thành công',
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.delete]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể xóa biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async submissions(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID biểu mẫu không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      const { page, pageSize, date } = req.query || {};
      const result = await formService.getSubmissions(id, workspaceContext.workspaceOwnerId, {
        page,
        pageSize,
        date: date || null,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.submissions]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải danh sách bài nộp',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  async cancelSubmission(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      const submissionId = Number.parseInt(req.params.submissionId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(submissionId)) {
        return res.status(400).json({
          success: false,
          message: 'ID không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      const submission = await formService.cancelSubmission(id, submissionId, workspaceContext.workspaceOwnerId);
      return res.json({
        success: true,
        data: submission,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.cancelSubmission]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể huỷ bài nộp',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * POST /api/forms/:id/submissions/:submissionId/confirm-payment — chủ form (hoặc nhân viên có
   * quyền `forms`) xác nhận đã nhận tiền chuyển khoản (PR-3a mục 5).
   */
  async confirmPayment(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      const submissionId = Number.parseInt(req.params.submissionId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(submissionId)) {
        return res.status(400).json({
          success: false,
          message: 'ID không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      const submission = await formService.confirmPayment(
        id,
        submissionId,
        workspaceContext.workspaceOwnerId,
        workspaceContext.actorUserId
      );
      return res.json({
        success: true,
        data: submission,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.confirmPayment]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể xác nhận thanh toán',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /**
   * GET /api/forms/:id/campaign-preview?limit=
   * Preview bài nộp cho khung cấu hình node chiến dịch "Lấy dữ liệu từ biểu mẫu" (PR-6a → PR-6b).
   */
  async campaignPreview(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID biểu mẫu không hợp lệ',
          code: 'INVALID_ID',
        });
      }

      const result = await formService.getCampaignPreviewForForm(id, workspaceContext.workspaceOwnerId, {
        limit: req.query?.limit,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[FormController.campaignPreview]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải dữ liệu biểu mẫu cho chiến dịch',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }
}

export default new FormController();
