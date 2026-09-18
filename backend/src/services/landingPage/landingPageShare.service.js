import landingPageShareRepository from '../../repositories/landingPageShare.repository.js';

class LandingPageShareService {
  /**
   * Share a landing page with another user by email
   */
  async shareLandingPage({ landingPageId, workspaceOwnerId, recipientEmail, shareType = 'view' }) {
    const recipient = await landingPageShareRepository.findUserByEmail(recipientEmail);
    if (!recipient) {
      const error = new Error('Không tìm thấy người dùng với email này');
      error.status = 404;
      throw error;
    }
    if (Number(recipient.id) === Number(workspaceOwnerId)) {
      const error = new Error('Bạn không thể chia sẻ landing page với chính mình');
      error.status = 400;
      throw error;
    }
    const share = await landingPageShareRepository.create({
      idLandingPage: landingPageId,
      workspaceOwnerId,
      idRecipient: recipient.id,
      recipientEmail,
      shareType,
    });
    if (!share) {
      const error = new Error('Không tìm thấy landing page trong workspace');
      error.status = 404;
      throw error;
    }
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
      const error = new Error('Không tìm thấy landing page trong workspace');
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
