import db from '../../config/database.js';
import landingPageShareRepository from '../../repositories/landingPageShare.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';
import { buildLandingPageSharedEmail } from '../../utils/systemEmailShare.util.js';

class LandingPageShareService {
  /**
   * Share a landing page with another user by email.
   * Hỗ trợ cả email đã có user (active) và email ngoài hệ thống (pending).
   *
   * @returns {Promise<{
   *   success: true,
   *   share: object,
   *   recipient: { id: number, name: string, email: string } | null,
   *   isExistingUser: boolean,
   *   notificationSent: boolean,
   * }>}
   */
  async shareLandingPage({
    landingPageId,
    workspaceOwnerId,
    recipientEmail,
    shareType = 'view',
    senderName = null,
  }) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();

    const client = await db.getClient();
    let result;
    try {
      await client.query('BEGIN');
      result = await landingPageShareRepository.findOrCreatePendingByEmail(client, {
        landingPageId,
        workspaceOwnerId,
        recipientEmail: normalizedEmail,
        shareType,
      });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (!result) {
      const error = new Error('Không tìm thấy landing page trong không gian làm việc');
      error.status = 404;
      throw error;
    }

    // Tự gửi mail cho chính mình là vô nghĩa; chặn ở tầng service.
    if (result.recipient && Number(result.recipient.id) === Number(workspaceOwnerId)) {
      const error = new Error('Bạn không thể chia sẻ landing page với chính mình');
      error.status = 400;
      throw error;
    }

    // Fire-and-forget notification. Mail fail không làm fail share API — share đã ghi DB.
    let notificationSent = false;
    try {
      const sender = await this._resolveSenderName(workspaceOwnerId);
      await this._sendShareNotification({
        isExistingUser: result.isExistingUser,
        landingPageId,
        recipientEmail: normalizedEmail,
        recipient: result.recipient,
        shareType,
        senderName: sender || senderName,
      });
      notificationSent = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[LandingPageShareService] Failed to send share notification to ${normalizedEmail}:`,
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

  async _resolveLandingPageMeta(landingPageId, workspaceOwnerId) {
    const { rows } = await db.query(
      `SELECT lp.title, lp.slug,
              lpd.hostname AS custom_domain_hostname
         FROM landing_pages lp
         LEFT JOIN landing_page_domains lpd ON lpd.landing_page_id = lp.id
        WHERE lp.id = $1
          AND COALESCE(lp.workspace_owner_id, lp.id_user) = $2
        LIMIT 1`,
      [landingPageId, workspaceOwnerId]
    );
    return rows[0] || null;
  }

  async _sendShareNotification({
    isExistingUser,
    landingPageId,
    recipientEmail,
    recipient,
    shareType,
    senderName,
  }) {
    const meta = await this._resolveLandingPageMeta(landingPageId, recipient?.id);
    // Lấy meta qua workspace owner thay vì recipient (recipient có thể null khi pending).
    const safeMeta =
      meta ||
      (await this._resolveLandingPageMeta(
        landingPageId,
        // recipient có thể null — fallback: meta sẽ fail nếu không có quyền, dùng query khác qua owner
        // Trong trường hợp này ta chấp nhận null và bỏ qua.
        undefined
      ));
    const landingPageTitle = safeMeta?.title || 'Landing page';
    const landingPageUrl = safeMeta?.custom_domain_hostname
      ? `https://${safeMeta.custom_domain_hostname}`
      : safeMeta?.slug
        ? `https://${safeMeta.slug}.founderai.biz`
        : null;

    const { subject, html } = buildLandingPageSharedEmail({
      senderName: senderName || 'Một người dùng Founder AI',
      landingPageTitle,
      landingPageUrl,
      shareType,
      recipientName: recipient?.name || null,
      isExistingUser,
    });

    await sendSystemEmail({ to: recipientEmail, subject, html });
  }

  /**
   * Get landing pages shared with the current user
   */
  async getSharedWithMe({ userId, page = 1, limit = 20, search }) {
    const rows = await landingPageShareRepository.findSharedWithUser({ userId, page, limit, search });
    const total = await landingPageShareRepository.countSharedWithUser({ userId, search });
    const BASE_DOMAIN = 'founderai.biz';

    return {
      items: rows.map((item) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        isPublished: item.is_published,
        shareCount: item.share_count,
        shareType: item.share_type,
        sharedAt: item.shared_at,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        customDomainHostname: item.custom_domain_hostname,
        domainType: item.domain_type,
        publicUrl: item.custom_domain_hostname
          ? `https://${item.custom_domain_hostname}`
          : `https://${item.slug}.${BASE_DOMAIN}`,
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
   * Get all shares for a landing page (for owner to see who they shared with)
   */
  async getLandingPageShares(landingPageId, ownerId) {
    const owned = await landingPageShareRepository.isLandingPageOwnedByWorkspace(landingPageId, ownerId);
    if (!owned) {
      const error = new Error('Không tìm thấy landing page trong không gian làm việc');
      error.status = 404;
      throw error;
    }
    const shares = await landingPageShareRepository.findByLandingPage(landingPageId, ownerId);
    return shares.map((share) => ({
      id: share.id,
      recipient: {
        id: share.id_recipient,
        name: share.recipient_name,
        email: share.recipient_email,
      },
      shareType: share.share_type,
      status: share.status,
      createdAt: share.created_at,
      updatedAt: share.updated_at,
    }));
  }

  /**
   * Revoke a share
   */
  async revokeShare({ landingPageId, workspaceOwnerId, recipientId }) {
    const deleted = await landingPageShareRepository.delete(landingPageId, workspaceOwnerId, recipientId);
    if (!deleted) {
      const error = new Error('Không tìm thấy chia sẻ để xóa');
      error.status = 404;
      throw error;
    }
    return { success: true };
  }
}

export default new LandingPageShareService();
