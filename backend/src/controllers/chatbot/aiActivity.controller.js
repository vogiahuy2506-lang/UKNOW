import aiActivityService from '../../services/chatbot/aiActivity.service.js';
import { chargeAiCredit } from '../../middleware/aiCredit.middleware.js';
import { resolveWorkspaceOwnerId } from '../../services/storage/storageQuota.service.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  logWorkspace,
} from '../../services/audit.service.js';
import { getWorkspaceAuditContext } from '../../utils/auditContext.util.js';

class AiActivityController {
  /**
   * GET /api/chatbot/inbox/ai-activity
   */
  async getActivityReport(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { date, accountId } = req.query;
      const data = await aiActivityService.getActivityReport({
        userId,
        date: date ? String(date).trim() : null,
        accountId: accountId ? Number(accountId) : null,
      });
      return res.json({ success: true, data });
    } catch (err) {
      console.error('[AiActivityController] getActivityReport error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể tải báo cáo hoạt động AI',
      });
    }
  }

  /**
   * POST /api/chatbot/inbox/ai-activity/resume-all
   */
  async resumeAllAi(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const data = await aiActivityService.resumeAllAi({ userId });
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.INBOX_AI_PAUSE_UPDATED,
        AUDIT_ENTITY_TYPES.INBOX_CONVERSATION,
        null,
        { paused: false, scope: 'all', resumedCount: data.resumedCount }
      );
      return res.json({ success: true, data });
    } catch (err) {
      console.error('[AiActivityController] resumeAllAi error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể bật lại AI',
      });
    }
  }

  /**
   * POST /api/chatbot/inbox/ai-activity/summarize
   */
  async summarizeActivity(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const date = req.body?.date || req.query?.date || null;
      const data = await aiActivityService.summarizeDailyActivity({
        userId,
        date: date ? String(date).trim() : null,
        actorUserId: req.user?.id || null,
      });

      // Chỉ trừ credit nếu thực sự gọi Gemini sinh mới (không trừ nếu lấy từ cache)
      if (data && !data.cached && Array.isArray(data.summaries) && data.summaries.length > 0) {
        await chargeAiCredit(req);
      }

      return res.json({ success: true, data });
    } catch (err) {
      console.error('[AiActivityController] summarizeActivity error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể tóm tắt hội thoại bằng AI',
      });
    }
  }
}

export default new AiActivityController();
