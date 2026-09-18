import db from '../config/database.js';

class LandingPageShareRepository {
  /**
   * Create or update a share record
   */
  async create({ idLandingPage, workspaceOwnerId, idRecipient, recipientEmail, shareType = 'view' }) {
    const { rows } = await db.query(
      `INSERT INTO landing_page_shares (id_landing_page, id_owner, id_recipient, recipient_email, share_type)
       SELECT lp.id, $2, $3, $4, $5
       FROM landing_pages lp
       WHERE lp.id = $1
         AND COALESCE(lp.workspace_owner_id, lp.id_user) = $2
       ON CONFLICT (id_landing_page, id_recipient)
       DO UPDATE SET id_owner = EXCLUDED.id_owner,
                     recipient_email = EXCLUDED.recipient_email,
                     share_type = EXCLUDED.share_type,
                     updated_at = NOW()
       RETURNING *`,
      [idLandingPage, workspaceOwnerId, idRecipient, recipientEmail, shareType]
    );
    return rows[0];
  }

  /**
   * Get landing pages shared with the user (as recipient)
   */
  async findSharedWithUser({ userId, page = 1, limit = 20, search }) {
    const offset = (page - 1) * limit;
    const params = [userId];
    let query = `
      SELECT lp.id, lp.title, lp.slug, lp.is_published, lp.share_count, lp.created_at, lp.updated_at,
             lps.share_type, lps.created_at as shared_at,
             u.id as owner_id, COALESCE(u.full_name, u.username) as owner_name, u.email as owner_email,
             lpd.hostname as custom_domain_hostname, lp.domain_type
      FROM landing_page_shares lps
      JOIN landing_pages lp ON lps.id_landing_page = lp.id
      JOIN users u ON lps.id_owner = u.id
      LEFT JOIN landing_page_domains lpd ON lpd.landing_page_id = lp.id
      WHERE lps.id_recipient = $1
    `;
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (LOWER(lp.title) LIKE LOWER($${params.length}) OR LOWER(lp.slug) LIKE LOWER($${params.length}))`;
    }
    query += ` ORDER BY lps.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const { rows } = await db.query(query, params);
    return rows;
  }

  async countSharedWithUser({ userId, search }) {
    const params = [userId];
    let query = `
      SELECT COUNT(*)
      FROM landing_page_shares lps
      JOIN landing_pages lp ON lps.id_landing_page = lp.id
      WHERE lps.id_recipient = $1
    `;
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (LOWER(lp.title) LIKE LOWER($${params.length}) OR LOWER(lp.slug) LIKE LOWER($${params.length}))`;
    }
    const { rows } = await db.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  /**
   * Get all shares for a specific landing page (for owner to see who they shared with)
   */
  async findByLandingPage(idLandingPage, ownerId) {
    const { rows } = await db.query(
      `SELECT lps.*, u.full_name as recipient_name, u.email as recipient_email
       FROM landing_page_shares lps
       JOIN landing_pages lp ON lp.id = lps.id_landing_page
       JOIN users u ON u.id = lps.id_recipient
       WHERE lps.id_landing_page = $1
         AND COALESCE(lp.workspace_owner_id, lp.id_user) = $2
       ORDER BY lps.created_at DESC`,
      [idLandingPage, ownerId]
    );
    return rows;
  }

  /**
   * Delete a share (revoke)
   */
  async delete(idLandingPage, workspaceOwnerId, idRecipient) {
    const { rowCount } = await db.query(
      `DELETE FROM landing_page_shares lps
       USING landing_pages lp
       WHERE lps.id_landing_page = $1
         AND lps.id_recipient = $3
         AND lp.id = lps.id_landing_page
         AND COALESCE(lp.workspace_owner_id, lp.id_user) = $2`,
      [idLandingPage, workspaceOwnerId, idRecipient]
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

  async isLandingPageOwnedByWorkspace(landingPageId, workspaceOwnerId) {
    const { rows } = await db.query(
      `SELECT 1
       FROM landing_pages
       WHERE id = $1
         AND COALESCE(workspace_owner_id, id_user) = $2
       LIMIT 1`,
      [landingPageId, workspaceOwnerId]
    );
    return rows.length > 0;
  }
}

export default new LandingPageShareRepository();
