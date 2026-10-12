import {
  prepareWorkspaceSubmissionsExport,
  prepareFormSubmissionsExport,
} from '../services/formSubmissionExport.service.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { sendCsvExport } from '../utils/csvExportResponse.util.js';

/**
 * Xuất CSV bài nộp biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c). Cả router `/api/forms` đã gác quyền `forms`,
 * gói còn hạn, đổi mật khẩu, SĐT — controller chỉ lấy workspace từ ngữ cảnh đã xác thực (nhân viên → workspace của chủ).
 *
 * Mỗi lần xuất ghi nhật ký hoạt động (ai, loại, bộ lọc, số dòng) TRƯỚC khi gửi byte đầu tiên: dữ liệu cá nhân đã ra khỏi hệ thống thì
 * dấu vết phải có, kể cả khi người dùng huỷ tải giữa chừng.
 */

function handleError(res, error, logTag, fallbackMessage) {
  if (res.headersSent) {
    console.error(`[${logTag}] Lỗi sau khi đã gửi header:`, error);
    res.end();
    return;
  }
  const status = error.statusCode || 500;
  if (status >= 500) console.error(`[${logTag}]`, error);
  res.status(status).json({
    success: false,
    message: error.message || fallbackMessage,
    code: error.code || 'INTERNAL_ERROR',
  });
}

class FormSubmissionExportController {
  /**
   * GET /api/forms/submissions/export.csv?formId&landingPageSlug&from&to&lang — tab "Từ biểu mẫu" của màn "Khách để lại thông tin",
   * cùng bộ lọc với `GET /api/forms/submissions`.
   */
  async exportWorkspaceCsv(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const plan = await prepareWorkspaceSubmissionsExport(workspaceContext.workspaceOwnerId, req.query || {}, {
        lang: req.query?.lang,
      });
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.FORM_SUBMISSIONS_EXPORTED,
        AUDIT_ENTITY_TYPES.FORM,
        plan.audit.formId,
        plan.audit
      );
      await sendCsvExport(res, plan, { logLabel: 'FormSubmissionExport.workspace' });
    } catch (error) {
      handleError(res, error, 'FormSubmissionExport.workspace', 'Không thể xuất danh sách bài nộp');
    }
  }

  /**
   * GET /api/forms/:id/submissions/export.csv?date&lang — trang bài nộp của MỘT biểu mẫu (cột = nhãn trường của biểu mẫu đó).
   */
  async exportFormCsv(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const plan = await prepareFormSubmissionsExport(
        workspaceContext.workspaceOwnerId,
        req.params.id,
        req.query || {},
        { lang: req.query?.lang }
      );
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.FORM_SUBMISSIONS_EXPORTED,
        AUDIT_ENTITY_TYPES.FORM,
        plan.audit.formId,
        plan.audit
      );
      await sendCsvExport(res, plan, { logLabel: 'FormSubmissionExport.form' });
    } catch (error) {
      handleError(res, error, 'FormSubmissionExport.form', 'Không thể xuất danh sách bài nộp');
    }
  }
}

export default new FormSubmissionExportController();
