import aiActivityService from '../../services/chatbot/aiActivity.service.js';
import { chargeAiCredit } from '../../middleware/aiCredit.middleware.js';

class AiActivityController {
  /**
   * GET /api/chatbot/inbox/ai-activity
   */
  async getActivityReport(req, res) {
    try {
      const userId = req.user.id;
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
      const userId = req.user.id;
      const data = await aiActivityService.resumeAllAi({ userId });
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
      const userId = req.user.id;
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
