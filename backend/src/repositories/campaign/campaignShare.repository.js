import db from '../../config/database.js';
import { buildCampaignFilterSql } from './campaignCrud.repository.js';

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
  async findSharedWithUser({ userId, page = 1, limit = 10, search, status, type, state }) {
    const offset = (page - 1) * limit;
    const params = [userId];
    let query = `
      SELECT c.*, cs.share_type, cs.can_run, cs.created_at as shared_at,
              u.id as owner_id, COALESCE(u.full_name, u.username) as owner_name, u.email as owner_email,
              COALESCE(run_stats.running_count, 0)::INTEGER AS running_count,
              COALESCE(run_stats.completed_count, 0)::INTEGER AS completed_count,
              COALESCE(sched_stats.enabled_schedule_count, 0)::INTEGER AS enabled_schedule_count
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
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE csched.enabled)::INTEGER AS enabled_schedule_count
         FROM campaign_schedules csched WHERE csched.id_campaign = c.id
       ) sched_stats ON TRUE
       WHERE cs.id_recipient = $1
    `;

    query += buildCampaignFilterSql({ status, type, search, origin: undefined, state }, params, 'c');

    query += ` ORDER BY cs.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);
    return rows;
  }

  /**
   * Count campaigns shared with user
   */
  async countSharedWithUser(input) {
    const { userId, search, status, type, state } =
      typeof input === 'object' && input !== null ? input : { userId: input };

    const params = [userId];
    let query = `
      SELECT COUNT(*)
      FROM campaign_shares cs
      JOIN campaigns c ON cs.id_campaign = c.id
      WHERE cs.id_recipient = $1
    `;

    query += buildCampaignFilterSql({ status, type, search, origin: undefined, state }, params, 'c');

    const { rows } = await db.query(query, params);
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
   * Tạo hoặc cập nhật share:
   *   - Nếu recipientEmail khớp user có sẵn → share với id_recipient=user.id, status='active'.
   *   - Nếu recipientEmail CHƯA có user → share pending (id_recipient=NULL, status='pending').
   *     Đã có pending cùng campaign+email → UPDATE thay vì INSERT (de-dup).
   * 3 bước đi qua 1 transaction (client do caller quản lý) chống race.
   *
   * @returns {Promise<{ share: object, isExistingUser: boolean, recipient: object|null } | null>}
   *   Trả null nếu campaign không thuộc workspace_owner.
   */
  async findOrCreatePendingByEmail(
    client,
    { idCampaign, workspaceOwnerId, recipientEmail, shareType = 'view', canRun = false }
  ) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('recipientEmail is required');
    }
    const run = async (q) => (await client.query(q.text, q.values)).rows;

    // 1) Verify campaign thuộc workspace.
    // Ép kiểu ::bigint để tránh lỗi "could not determine data type" của pg khi cột nullable.
    const ownerRows = await run({
      text: `SELECT id
             FROM campaigns
             WHERE id = $1::bigint
               AND COALESCE(workspace_owner_id, id_user) = $2::bigint
             LIMIT 1`,
      values: [idCampaign, workspaceOwnerId],
    });
    if (ownerRows.length === 0) return null;

    // 2) Tìm user theo email (LOWER để dedup chữ hoa/thường).
    const userRows = await run({
      text: `SELECT id, full_name, username, email
             FROM users
             WHERE LOWER(email) = $1
             LIMIT 1`,
      values: [normalizedEmail],
    });
    const existingUser = userRows[0] || null;

    if (existingUser) {
      // Branch 1: user đã có tài khoản → share ACTIVE.
      const shareRows = await run({
        text: `INSERT INTO campaign_shares (id_campaign, id_owner, id_recipient, recipient_email, share_type, can_run, status)
               VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6, 'active')
               ON CONFLICT (id_campaign, id_recipient)
               DO UPDATE SET id_owner = EXCLUDED.id_owner,
                             recipient_email = EXCLUDED.recipient_email,
                             share_type = EXCLUDED.share_type,
                             can_run = EXCLUDED.can_run,
                             status = 'active',
                             updated_at = NOW()
               RETURNING *`,
        values: [
          idCampaign,
          workspaceOwnerId,
          existingUser.id,
          normalizedEmail,
          shareType,
          canRun,
        ],
      });
      return { share: shareRows[0], isExistingUser: true, recipient: existingUser };
    }

    // Branch 2: email ngoài hệ thống. De-dup theo (campaign, lower(email)) với id_recipient NULL.
    // Ép kiểu ::bigint để tránh lỗi "could not determine data type" của pg khi cột nullable.
    const existingPendingRows = await run({
      text: `SELECT id FROM campaign_shares
             WHERE id_campaign = $1::bigint
               AND id_recipient IS NULL
               AND status = 'pending'
               AND LOWER(recipient_email) = $2
             LIMIT 1`,
      values: [idCampaign, normalizedEmail],
    });

    if (existingPendingRows.length > 0) {
      // Cập nhật bản ghi pending hiện có (share_type, can_run, updated_at).
      // Bỏ $2 (idCampaign) — pg không cần nó khi chỉ update qua id.
      const updated = await run({
        text: `UPDATE campaign_shares
               SET share_type = $2, can_run = $3, updated_at = NOW()
               WHERE id = $1
               RETURNING *`,
        values: [existingPendingRows[0].id, shareType, canRun],
      });
      return { share: updated[0], isExistingUser: false, recipient: null };
    }

    // Tạo mới pending.
    const inserted = await run({
      text: `INSERT INTO campaign_shares (id_campaign, id_owner, id_recipient, recipient_email, share_type, can_run, status)
             VALUES ($1::bigint, $2::bigint, NULL, $3, $4, $5, 'pending')
             RETURNING *`,
      values: [Number(idCampaign), Number(workspaceOwnerId), normalizedEmail, shareType, canRun],
    });
    return { share: inserted[0], isExistingUser: false, recipient: null };
  }

  /**
   * Auto-claim tất cả share pending cho email của user vừa đăng ký.
   * Được gọi trong transaction của auth.controller ngay sau khi insert user.
   *
   * @returns {Promise<Array<{ id: number, id_campaign: number, share_type: string }>>}
   */
  async claimPendingByUserId(client, { userId, email }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!userId || !normalizedEmail) return [];
    const { rows } = await client.query(
      `UPDATE campaign_shares
         SET id_recipient = $1::bigint,
             status = 'active',
             updated_at = NOW()
       WHERE id_recipient IS NULL
         AND status = 'pending'
         AND LOWER(recipient_email) = $2
       RETURNING id, id_campaign, share_type`,
      [userId, normalizedEmail]
    );
    return rows;
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
