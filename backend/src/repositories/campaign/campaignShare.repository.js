import db from '../../config/database.js';

class CampaignShareRepository {
  /**
   * Create a new share record
   */
  async create({ idCampaign, workspaceOwnerId, idRecipient, recipientEmail, shareType = 'view', canRun = false }) {
    const { rows } = await db.query(
      `INSERT INTO campaign_shares (id_campaign, id_owner, id_recipient, recipient_email, share_type, can_run)
       SELECT c.id, $2, $3, $4, $5, $6
       FROM campaigns c
       WHERE c.id = $1
         AND COALESCE(c.workspace_owner_id, c.id_user) = $2
       ON CONFLICT (id_campaign, id_recipient)
       DO UPDATE SET id_owner = EXCLUDED.id_owner,
                     recipient_email = EXCLUDED.recipient_email,
                     share_type = EXCLUDED.share_type,
                     can_run = EXCLUDED.can_run,
                     updated_at = NOW()
       RETURNING *`,
      [idCampaign, workspaceOwnerId, idRecipient, recipientEmail, shareType, canRun]
    );
    return rows[0];
  }

  /**
   * Find share by campaign and recipient
   */
  async findByCampaignAndRecipient(idCampaign, idRecipient) {
    const { rows } = await db.query(
      `SELECT cs.*, u.full_name as owner_name, u.email as owner_email
       FROM campaign_shares cs
       JOIN users u ON cs.id_owner = u.id
       WHERE cs.id_campaign = $1 AND cs.id_recipient = $2`,
      [idCampaign, idRecipient]
    );
    return rows[0] || null;
  }

  /**
   * Get all campaigns shared WITH the user (as recipient)
   */
  async findSharedWithUser({ userId, page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const { rows } = await db.query(
      `SELECT c.*, cs.share_type, cs.can_run, cs.created_at as shared_at,
              u.id as owner_id, COALESCE(u.full_name, u.username) as owner_name, u.email as owner_email,
              COALESCE(run_stats.running_count, 0)::INTEGER AS running_count,
              COALESCE(run_stats.completed_count, 0)::INTEGER AS completed_count
       FROM campaign_shares cs
       JOIN campaigns c ON cs.id_campaign = c.id
       JOIN users u ON cs.id_owner = u.id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE cr.status = 'running') AS running_count,
           COUNT(*) FILTER (WHERE cr.status = 'completed') AS completed_count
         FROM campaign_runs cr
         WHERE cr.id_campaign = c.id
       ) run_stats ON TRUE
       WHERE cs.id_recipient = $1
       ORDER BY cs.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  }

  /**
   * Count campaigns shared with user
   */
  async countSharedWithUser(userId) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM campaign_shares WHERE id_recipient = $1`,
      [userId]
    );
    return parseInt(rows[0].count, 10);
  }

  /**
   * Get all shares for a campaign (for owner to see who they shared with)
   */
  async findByCampaign(idCampaign, ownerId) {
    const { rows } = await db.query(
      `SELECT cs.*, u.full_name as recipient_name, u.email as recipient_email
       FROM campaign_shares cs
       JOIN campaigns c ON c.id = cs.id_campaign
       JOIN users u ON cs.id_recipient = u.id
       WHERE cs.id_campaign = $1
         AND COALESCE(c.workspace_owner_id, c.id_user) = $2
       ORDER BY cs.created_at DESC`,
      [idCampaign, ownerId]
    );
    return rows;
  }

  /**
   * Get campaigns that user has shared with others
   */
  async findSharedByUser({ workspaceOwnerId, page = 1, limit = 10 }) {
    const offset = (page - 1) * limit;
    const { rows } = await db.query(
      `SELECT c.*, c.share_count,
              COALESCE(run_stats.running_count, 0)::INTEGER AS running_count,
              COALESCE(run_stats.completed_count, 0)::INTEGER AS completed_count
       FROM campaigns c
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE cr.status = 'running') AS running_count,
           COUNT(*) FILTER (WHERE cr.status = 'completed') AS completed_count
         FROM campaign_runs cr
         WHERE cr.id_campaign = c.id
       ) run_stats ON TRUE
       WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1 AND c.share_count > 0
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceOwnerId, limit, offset]
    );
    return rows;
  }

  /**
   * Count campaigns shared by user
   */
  async countSharedByUser(workspaceOwnerId) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FROM campaigns
       WHERE COALESCE(workspace_owner_id, id_user) = $1 AND share_count > 0`,
      [workspaceOwnerId]
    );
    return parseInt(rows[0].count, 10);
  }

  /**
   * Delete a share
   */
  async delete(idCampaign, workspaceOwnerId, idRecipient) {
    const { rowCount } = await db.query(
      `DELETE FROM campaign_shares cs
       USING campaigns c
       WHERE cs.id_campaign = $1
         AND cs.id_recipient = $3
         AND c.id = cs.id_campaign
         AND COALESCE(c.workspace_owner_id, c.id_user) = $2`,
      [idCampaign, workspaceOwnerId, idRecipient]
    );
    return rowCount > 0;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email) {
    const { rows } = await db.query(
      `SELECT id, full_name, username, email FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  }

  async isCampaignOwnedByWorkspace(campaignId, workspaceOwnerId) {
    const { rows } = await db.query(
      `SELECT 1
       FROM campaigns
       WHERE id = $1
         AND COALESCE(workspace_owner_id, id_user) = $2
       LIMIT 1`,
      [campaignId, workspaceOwnerId]
    );
    return rows.length > 0;
  }

  /**
   * Check if user has edit permission for a campaign
   */
  async hasEditPermission(campaignId, userId) {
    // Owner has edit permission
    const { rows: ownerRows } = await db.query(
      `SELECT id FROM campaigns
       WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2`,
      [campaignId, userId]
    );
    if (ownerRows.length > 0) return true;

    // Or has edit share
    const { rows: shareRows } = await db.query(
      `SELECT id FROM campaign_shares WHERE id_campaign = $1 AND id_recipient = $2 AND share_type = 'edit'`,
      [campaignId, userId]
    );
    return shareRows.length > 0;
  }

  /**
   * Check if user can run a campaign
   */
  async canRun(campaignId, userId) {
    // Owner can always run
    const { rows: ownerRows } = await db.query(
      `SELECT id FROM campaigns
       WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2`,
      [campaignId, userId]
    );
    if (ownerRows.length > 0) return true;

    // Or has can_run permission
    const { rows: shareRows } = await db.query(
      `SELECT id FROM campaign_shares WHERE id_campaign = $1 AND id_recipient = $2 AND can_run = TRUE`,
      [campaignId, userId]
    );
    return shareRows.length > 0;
  }
}

export default new CampaignShareRepository();
