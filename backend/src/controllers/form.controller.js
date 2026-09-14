import formService from '../services/form.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

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
      const { title, description, fields, settings, bookingConfig } = req.body || {};

      const form = await formService.createForm({
        workspaceOwnerId: workspaceContext.workspaceOwnerId,
        createdByUserId: workspaceContext.actorUserId,
        title,
        description,
        fields,
        settings,
        bookingConfig,
      });

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

      const form = await formService.updateForm(id, workspaceContext.workspaceOwnerId, req.body || {});
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
