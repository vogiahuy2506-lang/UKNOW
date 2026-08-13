import campaignShareRepository from '../../repositories/campaign/campaignShare.repository.js';

class CampaignShareService {
  /**
   * Share a campaign with another user by email
   */
  async shareCampaign({ campaignId, ownerId, recipientEmail, shareType = 'view', canRun = false }) {
    // Find recipient by email
    const recipient = await campaignShareRepository.findUserByEmail(recipientEmail);
    if (!recipient) {
      const error = new Error('Không tìm thấy người dùng với email này');
      error.status = 404;
      throw error;
    }

    // Cannot share with yourself
    if (recipient.id === ownerId) {
      const error = new Error('Bạn không thể chia sẻ chiến dịch với chính mình');
      error.status = 400;
      throw error;
    }

    // Create share record
    const share = await campaignShareRepository.create({
      idCampaign: campaignId,
      idOwner: ownerId,
      idRecipient: recipient.id,
      recipientEmail,
      shareType,
      canRun,
    });

    return {
      success: true,
      share,
      recipient: {
        id: recipient.id,
        name: recipient.full_name || recipient.username,
        email: recipient.email,
      },
    };
  }

  /**
   * Get campaigns shared with the current user
   */
  async getSharedWithMe({ userId, page = 1, limit = 10 }) {
    const rows = await campaignShareRepository.findSharedWithUser({ userId, page, limit });
    const total = await campaignShareRepository.countSharedWithUser(userId);

    return {
      items: rows.map((item) => ({
        id: item.id,
        campaignName: item.campaign_name,
        description: item.description,
        campaignType: item.campaign_type,
        status: item.status,
        startDate: item.start_date,
        endDate: item.end_date,
        totalCustomers: item.total_customers,
        totalSent: item.total_sent,
        totalDelivered: item.total_delivered,
        totalOpened: item.total_opened,
        totalClicked: item.total_clicked,
        totalConverted: item.total_converted,
        totalRevenue: item.total_revenue,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        publishedAt: item.published_at,
        lastRunAt: item.last_run_at,
        runningCount: item.running_count,
        completedCount: item.completed_count,
        shareType: item.share_type,
        canRun: item.can_run,
        sharedAt: item.shared_at,
        sharedBy: {
          id: item.owner_id,
          name: item.owner_name,
          email: item.owner_email,
        },
        origin: 'shared_received',
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get campaigns shared by the current user (to see who they shared with)
   */
  async getSharedByMe({ userId, page = 1, limit = 10 }) {
    const rows = await campaignShareRepository.findSharedByUser({ userId, page, limit });
    const total = await campaignShareRepository.countSharedByUser(userId);

    return {
      items: rows.map((item) => ({
        id: item.id,
        campaignName: item.campaign_name,
        description: item.description,
        campaignType: item.campaign_type,
        status: item.status,
        shareCount: item.share_count,
        origin: 'self_created',
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all shares for a campaign (for owner)
   */
  async getCampaignShares(campaignId, ownerId) {
    const shares = await campaignShareRepository.findByCampaign(campaignId, ownerId);

    return shares.map((share) => ({
      id: share.id,
      recipient: {
        id: share.id_recipient,
        name: share.recipient_name,
        email: share.recipient_email,
      },
      shareType: share.share_type,
      canRun: share.can_run,
      createdAt: share.created_at,
      updatedAt: share.updated_at,
    }));
  }

  /**
   * Revoke a share
   */
  async revokeShare({ campaignId, ownerId, recipientId }) {
    const deleted = await campaignShareRepository.delete(campaignId, ownerId, recipientId);

    if (!deleted) {
      const error = new Error('Không tìm thấy chia sẻ để xóa');
      error.status = 404;
      throw error;
    }

    return { success: true };
  }

  /**
   * Check if user can edit a campaign
   */
  async canEdit(campaignId, userId) {
    return campaignShareRepository.hasEditPermission(campaignId, userId);
  }

  /**
   * Check if user can run a campaign
   */
  async canRunCampaign(campaignId, userId) {
    return campaignShareRepository.canRun(campaignId, userId);
  }
}

export default new CampaignShareService();
