import db from '../../config/database.js';
import campaignShareRepository from '../../repositories/campaign/campaignShare.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';
import { buildCampaignSharedEmail } from '../../utils/systemEmailShare.util.js';

class CampaignShareService {
  /**
   * Share a campaign với một email — hỗ trợ cả email đã có user (active)
   * và email ngoài hệ thống (pending).
   *
   * @returns {Promise<{
   *   success: true,
   *   share: object,
   *   recipient: { id: number, name: string, email: string } | null,
   *   isExistingUser: boolean,
   *   notificationSent: boolean,
   * }>}
   */
  async shareCampaign({ campaignId, workspaceOwnerId, recipientEmail, shareType = 'view', canRun = false }) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();

    const client = await db.getClient();
    let result;
    try {
      await client.query('BEGIN');
      result = await campaignShareRepository.findOrCreatePendingByEmail(client, {
        campaignId,
        workspaceOwnerId,
        recipientEmail: normalizedEmail,
        shareType,
        canRun,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (!result) {
      const error = new Error('Không tìm thấy chiến dịch trong không gian làm việc');
      error.status = 404;
      throw error;
    }

    // Tự share với chính mình là vô nghĩa.
    if (result.recipient && Number(result.recipient.id) === Number(workspaceOwnerId)) {
      const error = new Error('Bạn không thể chia sẻ chiến dịch với chính mình');
      error.status = 400;
      throw error;
    }

    // Fire-and-forget notification. Mail fail không làm fail share API — share đã ghi DB.
    let notificationSent = false;
    try {
      const sender = await this._resolveSenderName(workspaceOwnerId);
      await this._sendShareNotification({
        isExistingUser: result.isExistingUser,
        campaignId,
        recipientEmail: normalizedEmail,
        recipient: result.recipient,
        shareType,
        canRun,
        senderName: sender,
      });
      notificationSent = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[CampaignShareService] Failed to send share notification to ${normalizedEmail}:`,
        err?.message || err
      );
    }

    return {
      success: true,
      share: result.share,
      recipient: result.recipient
        ? {
            id: result.recipient.id,
            name: result.recipient.full_name || result.recipient.username,
            email: result.recipient.email,
          }
        : null,
      isExistingUser: result.isExistingUser,
      notificationSent,
    };
  }

  async _resolveSenderName(workspaceOwnerId) {
    try {
      const { rows } = await db.query(
        `SELECT COALESCE(full_name, username) AS name FROM users WHERE id = $1 LIMIT 1`,
        [workspaceOwnerId]
      );
      return rows[0]?.name || null;
    } catch {
      return null;
    }
  }

  async _sendShareNotification({
    isExistingUser,
    campaignId,
    recipientEmail,
    recipient,
    shareType,
    canRun,
    senderName,
  }) {
    const meta = await this._resolveCampaignMeta(campaignId, recipient?.id || senderName);
    const safeMeta =
      meta ||
      (await this._resolveCampaignMeta(
        campaignId,
        // fallback: meta sẽ fail nếu không có quyền, dùng query khác qua owner
        undefined
      ));
    const campaignName = safeMeta?.campaign_name || 'Chiến dịch';

    const { subject, html } = buildCampaignSharedEmail({
      senderName: senderName || 'Một người dùng Founder AI',
      campaignName,
      campaignUrl: null,
      shareType,
      canRun,
      recipientName: recipient?.name || null,
      isExistingUser,
    });

    await sendSystemEmail({ to: recipientEmail, subject, html });
  }

  async _resolveCampaignMeta(campaignId, fallbackUserId) {
    const { rows } = await db.query(
      `SELECT c.campaign_name
         FROM campaigns c
        WHERE c.id = $1
        LIMIT 1`,
      [campaignId]
    );
    return rows[0] || null;
  }

  /**
   * Get campaigns shared with the current user
   */
  async getSharedWithMe({ userId, page = 1, limit = 10, search, status, type, state }) {
    const rows = await campaignShareRepository.findSharedWithUser({ userId, page, limit, search, status, type, state });
    const total = await campaignShareRepository.countSharedWithUser({ userId, search, status, type, state });

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
        enabledScheduleCount: item.enabled_schedule_count ?? 0,
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
  async getSharedByMe({ workspaceOwnerId, page = 1, limit = 10 }) {
    const rows = await campaignShareRepository.findSharedByUser({ workspaceOwnerId, page, limit });
    const total = await campaignShareRepository.countSharedByUser(workspaceOwnerId);

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
    const owned = await campaignShareRepository.isCampaignOwnedByWorkspace(campaignId, ownerId);
    if (!owned) {
      const error = new Error('Không tìm thấy chiến dịch trong không gian làm việc');
      error.status = 404;
      throw error;
    }
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
      status: share.status,
      createdAt: share.created_at,
      updatedAt: share.updated_at,
    }));
  }

  /**
   * Revoke a share
   */
  async revokeShare({ campaignId, workspaceOwnerId, recipientId }) {
    const deleted = await campaignShareRepository.delete(campaignId, workspaceOwnerId, recipientId);

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
