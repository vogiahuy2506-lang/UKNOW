import { parseLandingLeadFilters } from './lead.controller.js';
import { prepareLandingLeadsExport } from '../services/leadCsvExport.service.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';
import { sendCsvExport } from '../utils/csvExportResponse.util.js';

/**
 * GET /api/leads/export.csv — xuất CSV khách từ landing page (tab "Từ landing page" của màn "Khách để lại thông tin"), PR-8c biểu mẫu.
 * Quyền `leads` do route gác. Cùng tham số lọc với `GET /api/leads` (+ `lang`=vi|en), không phân trang; tối đa 20.000 dòng, bị cắt thì báo
 * qua `X-Export-Truncated`. Ghi nhật ký hoạt động TRƯỚC khi gửi byte đầu tiên.
 */
class LeadExportController {
  async exportCsv(req, res) {
    try {
      const workspaceContext = getWorkspaceContext(req.user);
      const config = {
        ...parseLandingLeadFilters(req.query || {}),
        workspaceOwnerId: workspaceContext.workspaceOwnerId,
        isSuperAdmin: workspaceContext.isSuperAdmin,
      };
      const plan = await prepareLandingLeadsExport(config, { lang: req.query?.lang });
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.LANDING_LEADS_EXPORTED,
        AUDIT_ENTITY_TYPES.LEAD,
        null,
        plan.audit
      );
      await sendCsvExport(res, plan, { logLabel: 'LeadExport.csv' });
    } catch (error) {
      if (res.headersSent) {
        console.error('[LeadExport.csv] Lỗi sau khi đã gửi header:', error);
        res.end();
        return;
      }
      const status = error.statusCode || 500;
      if (status >= 500) console.error('[LeadExport.csv]', error);
      res.status(status).json({ success: false, message: error.message || 'Không thể xuất file CSV' });
    }
  }
}

export default new LeadExportController();
