import landingPageShareService from '../services/landingPage/landingPageShare.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

class LandingPageShareController {
  /**
   * Share a landing page with another user
   */
  async share(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const landingPageId = parseInt(req.params.id, 10);
      const { recipientEmail, shareType = 'view' } = req.body;

      if (!landingPageId || !recipientEmail) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin landingPageId hoặc recipientEmail',
        });
      }

      const result = await landingPageShareService.shareLandingPage({
        landingPageId,
        workspaceOwnerId: context.workspaceOwnerId,
        recipientEmail,
        shareType,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Share landing page error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi server',
      });
    }
  }

  /**
   * Get landing pages shared with me
   */
  async getSharedWithMe(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const { page = 1, limit = 20, search } = req.query;

      const result = await landingPageShareService.getSharedWithMe({
        userId: context.actorUserId,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search,
      });

      res.json({ success: true, data: result });
    } catch (error) {
      console.error('Get shared landing pages error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Get all shares for a specific landing page
   */
  async getLandingPageShares(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const landingPageId = parseInt(req.params.id, 10);
      if (!landingPageId) {
        return res.status(400).json({ success: false, message: 'landingPageId không hợp lệ' });
      }
      const shares = await landingPageShareService.getLandingPageShares(
        landingPageId,
        context.workspaceOwnerId
      );
      res.json({ success: true, data: shares });
    } catch (error) {
      console.error('Get landing page shares error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi server',
      });
    }
  }

  /**
   * Revoke a share
   */
  async revokeShare(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const landingPageId = parseInt(req.params.id, 10);
      const { recipientId } = req.body;
      if (!landingPageId || !recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin landingPageId hoặc recipientId',
        });
      }
      await landingPageShareService.revokeShare({
        landingPageId,
        workspaceOwnerId: context.workspaceOwnerId,
        recipientId: parseInt(recipientId, 10),
      });
      res.json({ success: true, message: 'Đã hủy chia sẻ thành công' });
    } catch (error) {
      console.error('Revoke share error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi server',
      });
    }
  }
}

export default new LandingPageShareController();
