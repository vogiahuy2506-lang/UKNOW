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
   * Tạo hoặc cập nhật share:
   *   - Nếu recipientEmail khớp user có sẵn → share với id_recipient=user.id, status='active'.
   *   - Nếu recipientEmail CHƯA có user → share pending (id_recipient=NULL, status='pending').
   *     Đã có pending cùng landing_page+email → UPDATE thay vì INSERT (de-dup).
   * 3 bước đi qua 1 transaction (client do caller quản lý) chống race.
   *
   * @returns {Promise<{ share: object, isExistingUser: boolean, recipient: object|null } | null>}
   *   Trả null nếu landing_page không thuộc workspace_owner.
   */
  async findOrCreatePendingByEmail(
    client,
    { idLandingPage, workspaceOwnerId, recipientEmail, shareType = 'view' }
  ) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('recipientEmail is required');
    }
    const run = async (q) => (await client.query(q.text, q.values)).rows;

    // 1) Verify landing page thuộc workspace.
    const ownerRows = await run({
      text: `SELECT lp.id
             FROM landing_pages lp
             WHERE lp.id = $1
               AND COALESCE(lp.workspace_owner_id, lp.id_user) = $2
             LIMIT 1`,
      values: [idLandingPage, workspaceOwnerId],
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
        text: `INSERT INTO landing_page_shares (id_landing_page, id_owner, id_recipient, recipient_email, share_type, status)
               VALUES ($1, $2, $3, $4, $5, 'active')
               ON CONFLICT (id_landing_page, id_recipient)
               DO UPDATE SET id_owner = EXCLUDED.id_owner,
                             recipient_email = EXCLUDED.recipient_email,
                             share_type = EXCLUDED.share_type,
                             status = 'active',
                             updated_at = NOW()
               RETURNING *`,
        values: [idLandingPage, workspaceOwnerId, existingUser.id, normalizedEmail, shareType],
      });
      return { share: shareRows[0], isExistingUser: true, recipient: existingUser };
    }

    // Branch 2: email ngoài hệ thống. De-dup theo (landing_page, lower(email)) với id_recipient NULL.
    const existingPendingRows = await run({
      text: `SELECT id FROM landing_page_shares
             WHERE id_landing_page = $1
               AND id_recipient IS NULL
               AND status = 'pending'
               AND LOWER(recipient_email) = $2
             LIMIT 1`,
      values: [idLandingPage, normalizedEmail],
    });

    if (existingPendingRows.length > 0) {
      // Cập nhật bản ghi pending hiện có (share_type, updated_at).
      const updated = await run({
        text: `UPDATE landing_page_shares
               SET share_type = $3, updated_at = NOW()
               WHERE id = $1
               RETURNING *`,
        values: [existingPendingRows[0].id, idLandingPage, shareType],
      });
      return { share: updated[0], isExistingUser: false, recipient: null };
    }

    // Tạo mới pending.
    const inserted = await run({
      text: `INSERT INTO landing_page_shares (id_landing_page, id_owner, id_recipient, recipient_email, share_type, status)
             VALUES ($1, $2, NULL, $3, $4, 'pending')
             RETURNING *`,
      values: [idLandingPage, workspaceOwnerId, normalizedEmail, shareType],
    });
    return { share: inserted[0], isExistingUser: false, recipient: null };
  }

  /**
   * Auto-claim tất cả share pending cho email của user vừa đăng ký.
   * Được gọi trong transaction của auth.controller ngay sau khi insert user.
   *
   * @returns {Promise<Array<{ id: number, id_landing_page: number, share_type: string }>>}
   */
  async claimPendingByUserId(client, { userId, email }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!userId || !normalizedEmail) return [];
    const { rows } = await client.query(
      `UPDATE landing_page_shares
         SET id_recipient = $1,
             status = 'active',
             updated_at = NOW()
       WHERE id_recipient IS NULL
         AND status = 'pending'
         AND LOWER(recipient_email) = $2
       RETURNING id, id_landing_page, share_type`,
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
