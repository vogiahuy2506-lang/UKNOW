import chatbotContactAlertRepository from '../../repositories/chatbot/chatbotContactAlert.repository.js';
import { resolveWorkspaceOwnerId } from '../../services/storage/storageQuota.service.js';

class ChatbotContactAlertController {
  /**
   * GET /api/ai/chatbot/inbox/contact-alerts
   */
  async listAlerts(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { status = 'open', limit = 50, offset = 0 } = req.query;
      const data = await chatbotContactAlertRepository.listForOwner(userId, {
        status: String(status).trim(),
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      });
      return res.json({ success: true, data });
    } catch (err) {
      console.error('[ChatbotContactAlertController] listAlerts error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể tải danh sách liên hệ khách để lại',
      });
    }
  }

  /**
   * POST /api/ai/chatbot/inbox/contact-alerts/:id/handled
   */
  async markHandled(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
      }
      const handledBy = req.user?.id || null;
      const alert = await chatbotContactAlertRepository.markHandled(id, userId, handledBy);
      if (!alert) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy liên hệ hoặc không có quyền' });
      }
      return res.json({ success: true, data: alert });
    } catch (err) {
      console.error('[ChatbotContactAlertController] markHandled error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể đánh dấu đã liên hệ',
      });
    }
  }

  /**
   * DELETE /api/ai/chatbot/inbox/contact-alerts/:id/handled
   */
  async unmarkHandled(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ success: false, message: 'ID không hợp lệ' });
      }
      const alert = await chatbotContactAlertRepository.unmarkHandled(id, userId);
      if (!alert) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy liên hệ hoặc không có quyền' });
      }
      return res.json({ success: true, data: alert });
    } catch (err) {
      console.error('[ChatbotContactAlertController] unmarkHandled error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể bỏ đánh dấu đã liên hệ',
      });
    }
  }

  /**
   * GET /api/ai/chatbot/inbox/contact-alerts/settings
   */
  async getSettings(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const emailEnabled = await chatbotContactAlertRepository.getOwnerAlertEmail(userId);
      return res.json({ success: true, data: { emailEnabled } });
    } catch (err) {
      console.error('[ChatbotContactAlertController] getSettings error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể tải cấu hình thông báo',
      });
    }
  }

  /**
   * PUT /api/ai/chatbot/inbox/contact-alerts/settings
   */
  async updateSettings(req, res) {
    try {
      // Chỉ chủ tài khoản mới được cấu hình công tắc email
      if (req.user.activeContext?.type === 'employee') {
        return res.status(403).json({
          success: false,
          message: 'Chỉ chủ tài khoản mới có quyền cấu hình nhận email thông báo',
        });
      }

      const userId = resolveWorkspaceOwnerId(req.user);
      const { emailEnabled } = req.body;
      if (typeof emailEnabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'emailEnabled phải là boolean (true hoặc false)',
        });
      }

      await chatbotContactAlertRepository.setOwnerAlertEmail(userId, emailEnabled);
      return res.json({ success: true, data: { emailEnabled } });
    } catch (err) {
      console.error('[ChatbotContactAlertController] updateSettings error:', err);
      return res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Không thể cập nhật cấu hình thông báo',
      });
    }
  }
}

export default new ChatbotContactAlertController();
