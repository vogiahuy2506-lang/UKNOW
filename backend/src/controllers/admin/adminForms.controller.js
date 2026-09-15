import formService from '../../services/form.service.js';
import { logSystem, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../../services/audit.service.js';
import { getSystemAuditContext } from '../../utils/auditContext.util.js';

class AdminFormsController {
  /** GET /api/admin/forms?q=&page=&pageSize= (PR-3a mục 9) */
  async list(req, res) {
    try {
      const { q, page, pageSize } = req.query || {};
      const result = await formService.adminListForms({ q, page, pageSize });
      return res.json({ success: true, data: result });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[AdminFormsController.list]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể tải danh sách biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }

  /** PUT /api/admin/forms/:id/disable */
  async disable(req, res) {
    return this.setDisabled(req, res, true);
  }

  /** PUT /api/admin/forms/:id/enable */
  async enable(req, res) {
    return this.setDisabled(req, res, false);
  }

  async setDisabled(req, res, disabled) {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'ID biểu mẫu không hợp lệ', code: 'INVALID_ID' });
      }

      const form = await formService.adminSetFormDisabled(id, disabled);

      await logSystem(
        getSystemAuditContext(req),
        disabled ? AUDIT_ACTIONS.FORM_DISABLED : AUDIT_ACTIONS.FORM_ENABLED,
        AUDIT_ENTITY_TYPES.FORM,
        form.id,
        { publicKey: form.publicKey, title: form.title }
      );

      return res.json({ success: true, data: form });
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[AdminFormsController.setDisabled]', error);
      return res.status(status).json({
        success: false,
        message: error.message || 'Không thể cập nhật trạng thái biểu mẫu',
        code: error.code || 'INTERNAL_ERROR',
      });
    }
  }
}

export default new AdminFormsController();
