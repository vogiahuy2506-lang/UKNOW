import campaignShareService from '../services/campaign/campaignShare.service.js';
import { getWorkspaceContext } from '../utils/workspaceContext.util.js';

class CampaignShareController {
  /**
   * Share a campaign with another user
   */
  async share(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const campaignId = parseInt(req.params.id, 10);
      const { recipientEmail, shareType = 'view', canRun = false } = req.body;

      if (!campaignId || !recipientEmail) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin campaignId hoặc recipientEmail',
        });
      }

      const result = await campaignShareService.shareCampaign({
        campaignId,
        workspaceOwnerId: context.workspaceOwnerId,
        recipientEmail,
        shareType,
        canRun,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Share campaign error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi server',
      });
    }
  }

  /**
   * Get campaigns shared with me
   */
  async getSharedWithMe(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const { page = 1, limit = 10 } = req.query;

      const result = await campaignShareService.getSharedWithMe({
        userId: context.actorUserId,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Get shared with me error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Get campaigns I've shared with others
   */
  async getSharedByMe(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const { page = 1, limit = 10 } = req.query;

      const result = await campaignShareService.getSharedByMe({
        workspaceOwnerId: context.workspaceOwnerId,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Get shared by me error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Get all shares for a specific campaign
   */
  async getCampaignShares(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const campaignId = parseInt(req.params.id, 10);

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          message: 'campaignId không hợp lệ',
        });
      }

      const shares = await campaignShareService.getCampaignShares(
        campaignId,
        context.workspaceOwnerId
      );

      res.json({
        success: true,
        data: shares,
      });
    } catch (error) {
      console.error('Get campaign shares error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.status ? error.message : 'Lỗi server',
      });
    }
  }

  /**
   * Revoke a share
   */
  async revokeShare(req, res) {
    try {
      const context = getWorkspaceContext(req.user);
      const campaignId = parseInt(req.params.id, 10);
      const { recipientId } = req.body;

      if (!campaignId || !recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin campaignId hoặc recipientId',
        });
      }

      await campaignShareService.revokeShare({
        campaignId: parseInt(campaignId, 10),
        workspaceOwnerId: context.workspaceOwnerId,
        recipientId: parseInt(recipientId, 10),
      });

      res.json({
        success: true,
        message: 'Đã hủy chia sẻ thành công',
      });
    } catch (error) {
      console.error('Revoke share error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Lỗi server',
      });
    }
  }
}

export default new CampaignShareController();
