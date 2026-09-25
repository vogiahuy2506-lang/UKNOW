import db from '../../config/database.js';

/**
 * PR-3: Repository cho chatbot_shares.
 *
 * Schema:
 *   - id_chatbot, id_owner, id_recipient (nullable), recipient_email, status (pending/active/revoked).
 *   - Pending share (id_recipient NULL + status='pending') → chờ user đăng ký, sau đó claim
 *     sẽ thực hiện clone thật sự (gọi từ auth.controller).
 *   - Active share (id_recipient NOT NULL + status='active') → đã có user, clone xong ngay.
 *
 * De-dup: cùng (id_chatbot, id_recipient) chỉ có 1 share active (partial unique index).
 */
class ChatbotShareRepository {
  /**
   * Tạo hoặc cập nhật share:
   *   - Nếu recipientEmail khớp user có sẵn → share với id_recipient=user.id, status='active'.
   *     De-dup theo (id_chatbot, id_recipient) — UPSERT.
   *   - Nếu recipientEmail CHƯA có user → share pending (id_recipient=NULL, status='pending').
   *     De-dup theo (id_chatbot, lower(email)) với id_recipient NULL.
   *
   * @returns {Promise<{ share: object, isExistingUser: boolean, recipient: object|null } | null>}
   *   Trả null nếu chatbot không thuộc owner.
   */
  async findOrCreatePendingByEmail(
    client,
    { idChatbot, ownerId, recipientEmail }
  ) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new Error('recipientEmail is required');
    }
    const run = async (q) => (await client.query(q.text, q.values)).rows;

    // 1) Verify chatbot thuộc owner.
    const ownerRows = await run({
      text: `SELECT id FROM custom_chatbots WHERE id = $1 AND id_user = $2 LIMIT 1`,
      values: [idChatbot, ownerId],
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
      // Branch 1: user đã có tài khoản → share ACTIVE (de-dup qua partial unique index).
      const shareRows = await run({
        text: `INSERT INTO chatbot_shares (id_chatbot, id_owner, id_recipient, recipient_email, status)
               VALUES ($1, $2, $3, $4, 'active')
               ON CONFLICT (id_chatbot, id_recipient) WHERE id_recipient IS NOT NULL
               DO UPDATE SET id_owner = EXCLUDED.id_owner,
                             recipient_email = EXCLUDED.recipient_email,
                             status = 'active',
                             updated_at = NOW()
               RETURNING *`,
        values: [idChatbot, ownerId, existingUser.id, normalizedEmail],
      });
      return { share: shareRows[0], isExistingUser: true, recipient: existingUser };
    }

    // Branch 2: email ngoài hệ thống. De-dup theo (chatbot, lower(email)) với id_recipient NULL.
    const existingPendingRows = await run({
      text: `SELECT id FROM chatbot_shares
             WHERE id_chatbot = $1
               AND id_recipient IS NULL
               AND status = 'pending'
               AND LOWER(recipient_email) = $2
             LIMIT 1`,
      values: [idChatbot, normalizedEmail],
    });

    if (existingPendingRows.length > 0) {
      const updated = await run({
        text: `UPDATE chatbot_shares SET updated_at = NOW() WHERE id = $1 RETURNING *`,
        values: [existingPendingRows[0].id],
      });
      return { share: updated[0], isExistingUser: false, recipient: null };
    }

    const inserted = await run({
      text: `INSERT INTO chatbot_shares (id_chatbot, id_owner, id_recipient, recipient_email, status)
             VALUES ($1, $2, NULL, $3, 'pending')
             RETURNING *`,
      values: [idChatbot, ownerId, normalizedEmail],
    });
    return { share: inserted[0], isExistingUser: false, recipient: null };
  }

  /**
   * Auto-claim tất cả share pending cho email của user vừa đăng ký.
   * Trả về danh sách share để service tự gọi cloneFromSource cho mỗi share.
   *
   * @returns {Promise<Array<{ id: number, id_chatbot: number, id_owner: number, recipient_email: string }>>}
   */
  async claimPendingByUserId(client, { userId, email }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!userId || !normalizedEmail) return [];
    const { rows } = await client.query(
      `UPDATE chatbot_shares
         SET id_recipient = $1,
             status = 'active',
             updated_at = NOW()
       WHERE id_recipient IS NULL
         AND status = 'pending'
         AND LOWER(recipient_email) = $2
       RETURNING id, id_chatbot, id_owner, recipient_email`,
      [userId, normalizedEmail]
    );
    return rows;
  }

  /**
   * Lấy danh sách share (active + pending) của 1 chatbot — owner xem.
   */
  async findByChatbot(idChatbot, ownerId) {
    const { rows } = await db.query(
      `SELECT cs.*,
              u.id AS recipient_user_id,
              COALESCE(u.full_name, u.username) AS recipient_name,
              u.email AS recipient_user_email
         FROM chatbot_shares cs
         LEFT JOIN users u ON u.id = cs.id_recipient
        WHERE cs.id_chatbot = $1
          AND cs.id_owner = $2
        ORDER BY cs.created_at DESC`,
      [idChatbot, ownerId]
    );
    return rows;
  }

  /**
   * Đánh dấu share đã xử lý (clone xong hoặc revoke).
   * Không bắt buộc — share active giữ nguyên để trace lịch sử.
   * Hiện tại chỉ dùng cho revoke.
   */
  async delete(idChatbot, ownerId, idRecipient) {
    const { rowCount } = await db.query(
      `DELETE FROM chatbot_shares
        WHERE id_chatbot = $1
          AND id_owner = $2
          AND id_recipient = $3`,
      [idChatbot, ownerId, idRecipient]
    );
    return rowCount > 0;
  }
}

export default new ChatbotShareRepository();
