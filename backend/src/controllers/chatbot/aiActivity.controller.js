import aiActivityService from '../../services/chatbot/aiActivity.service.js';
import { chargeAiCredit } from '../../middleware/aiCredit.middleware.js';
import { resolveWorkspaceOwnerId } from '../../services/storage/storageQuota.service.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';
import { getAccessibleZaloAccountIds } from '../../services/user/memberChannelAccess.service.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  logWorkspace,
} from '../../services/audit.service.js';
import { getWorkspaceAuditContext } from '../../utils/auditContext.util.js';
import { buildAiErrorPayload } from '../../utils/aiErrorPayload.util.js';

class AiActivityController {
  /**
   * GET /api/chatbot/inbox/ai-activity
   */
  async getActivityReport(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { date, accountId } = req.query;
      // G2: nhân viên chỉ thấy hội thoại của tài khoản Zalo được giao (null = chủ / super admin).
      const accessibleZaloAccountIds = await getAccessibleZaloAccountIds(getWorkspaceContext(req.user));
      const data = await aiActivityService.getActivityReport({
        userId,
        date: date ? String(date).trim() : null,
        accountId: accountId ? Number(accountId) : null,
        accessibleZaloAccountIds,
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
      // G2: nhân viên chỉ bật lại AI cho hội thoại của tài khoản Zalo được giao (null = chủ / super admin).
      const accessibleZaloAccountIds = await getAccessibleZaloAccountIds(getWorkspaceContext(req.user));
      const data = await aiActivityService.resumeAllAi({ userId, accessibleZaloAccountIds });
      await logWorkspace(
        getWorkspaceAuditContext(req),
        AUDIT_ACTIONS.INBOX_AI_PAUSE_UPDATED,
        AUDIT_ENTITY_TYPES.INBOX_CONVERSATION,
        null,
        { paused: false, scope: accessibleZaloAccountIds === null ? 'all' : 'assigned_accounts', resumedCount: data.resumedCount }
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
   * Middleware đứng TRƯỚC cổng credit của POST /api/chatbot/inbox/ai-activity/summarize (D-21).
   *
   * Bản tóm tắt đã lưu còn tươi (không có tin mới hơn mốc lưu) được trả thẳng, không qua cổng credit: người dùng đã trả tiền
   * cho bản đó, hết credit vẫn phải xem lại được. Không có cache tươi (hoặc đọc cache lỗi) → `next()` đi tiếp cổng credit rồi
   * sinh mới như cũ — lỗi đọc cache không bao giờ chặn tính năng.
   */
  async serveCachedSummary(req, res, next) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const date = req.body?.date || req.query?.date || null;
      const cached = await aiActivityService.findFreshCachedSummary({
        userId,
        date: date ? String(date).trim() : null,
      });
      if (cached) {
        return res.json({ success: true, data: cached });
      }
    } catch (err) {
      console.warn('[AiActivityController] Đọc cache tóm tắt trước cổng credit lỗi, đi tiếp luồng sinh mới:', err?.message);
    }
    return next();
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
      console.error('[AiActivityController] summarizeActivity error:', err, err?.providerMessage ? `| Google: ${err.providerMessage}` : '');
      // Lỗi từ Google mang nguyên câu JSON tiếng Anh — không đưa ra khách (D-19).
      return res.status(err.status || 500).json(buildAiErrorPayload(err, 'Không thể tóm tắt hội thoại bằng AI'));
    }
  }
}

export default new AiActivityController();
