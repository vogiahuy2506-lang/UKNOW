import db from '../../config/database.js';

/**
 * Bảng `support_tickets` + `support_ticket_messages` (migration 291) — ticket góp ý / hỗ trợ.
 *
 * Mọi câu SQL ghi nhận `client` tuỳ chọn để chạy trong giao dịch của service (tạo ticket = khoá + đếm hạn mức ngày + chèn ticket +
 * gắn tệp + chèn tin phải cùng một giao dịch).
 */

const TICKET_COLUMNS = `t.id, t.user_id, t.workspace_owner_id, t.subject, t.category, t.status, t.last_message_at,
       t.last_admin_reply_at, t.closed_at, t.closed_by, t.created_at, t.updated_at`;

const USER_COLUMNS = `u.full_name AS user_full_name, u.email AS user_email, u.username AS user_username`;

/** Escape `%`, `_`, `\` để chuỗi tìm kiếm của người dùng không thành ký tự đại diện của ILIKE. */
function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * @param {{ userId?: number|null, status?: string|null, category?: string|null, search?: string|null }} filter
 * @param {{ ignoreStatus?: boolean }} [options] bỏ lọc status (đếm theo từng trạng thái)
 * @returns {{ where: string, params: unknown[] }}
 */
function buildWhere({ userId = null, status = null, category = null, search = null }, { ignoreStatus = false } = {}) {
  const clauses = [];
  const params = [];
  if (userId != null) {
    params.push(userId);
    clauses.push(`t.user_id = $${params.length}`);
  }
  if (status && !ignoreStatus) {
    params.push(status);
    clauses.push(`t.status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    clauses.push(`t.category = $${params.length}`);
  }
  const term = String(search || '').trim();
  if (term) {
    params.push(`%${escapeLike(term)}%`);
    const like = `$${params.length}`;
    const searchClauses = [
      `t.subject ILIKE ${like} ESCAPE '\\'`,
      `u.email ILIKE ${like} ESCAPE '\\'`,
      `u.full_name ILIKE ${like} ESCAPE '\\'`,
      `u.username ILIKE ${like} ESCAPE '\\'`,
    ];
    if (/^\d{1,18}$/.test(term)) {
      params.push(term);
      searchClauses.push(`t.id = $${params.length}::bigint`);
    }
    clauses.push(`(${searchClauses.join(' OR ')})`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

class SupportTicketRepository {
  /**
   * Chạy `work(client)` trong một giao dịch; lỗi → ROLLBACK rồi ném lại.
   *
   * @template T
   * @param {(client: import('pg').PoolClient) => Promise<T>} work
   * @returns {Promise<T>}
   */
  async runInTransaction(work) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /** Khoá theo người dùng cho tới hết giao dịch: hai lượt tạo ticket đồng thời không cùng vượt hạn mức ngày. */
  async lockUserTicketCreation(client, userId) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('support_ticket_create'), hashtext($1::text))`,
      [String(userId)]
    );
  }

  /** Số ticket người này đã tạo trong `hours` giờ gần nhất. */
  async countCreatedSince(client, userId, hours) {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM support_tickets
        WHERE user_id = $1 AND created_at > NOW() - make_interval(hours => $2::int)`,
      [userId, hours]
    );
    return rows[0]?.total ?? 0;
  }

  async insertTicket(client, { userId, workspaceOwnerId = null, subject, category }) {
    const { rows } = await client.query(
      `INSERT INTO support_tickets (user_id, workspace_owner_id, subject, category)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, workspace_owner_id, subject, category, status, last_message_at,
                 last_admin_reply_at, closed_at, closed_by, created_at, updated_at`,
      [userId, workspaceOwnerId, subject, category]
    );
    return rows[0];
  }

  async insertMessage(client, { ticketId, authorUserId, authorRole, body, attachments = [] }) {
    const { rows } = await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_user_id, author_role, body, attachments)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id, ticket_id, author_user_id, author_role, body, attachments, created_at`,
      [ticketId, authorUserId, authorRole, body, JSON.stringify(attachments || [])]
    );
    return rows[0];
  }

  /** Đọc + khoá dòng ticket (FOR UPDATE) trong giao dịch — null khi không có. */
  async lockTicketById(client, ticketId) {
    const { rows } = await client.query(
      `SELECT id, user_id, workspace_owner_id, subject, category, status, last_message_at,
              last_admin_reply_at, closed_at, closed_by, created_at, updated_at
         FROM support_tickets
        WHERE id = $1
        FOR UPDATE`,
      [ticketId]
    );
    return rows[0] || null;
  }

  /** Người dùng nhắn thêm: ticket về `open` (mở lại nếu đã đóng), chờ admin. */
  async touchAfterUserMessage(client, ticketId) {
    const { rows } = await client.query(
      `UPDATE support_tickets
          SET status = 'open', last_message_at = NOW(), closed_at = NULL, closed_by = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING id, user_id, workspace_owner_id, subject, category, status, last_message_at,
                  last_admin_reply_at, closed_at, closed_by, created_at, updated_at`,
      [ticketId]
    );
    return rows[0] || null;
  }

  /** Admin trả lời: ticket sang `awaiting_user`, ghi mốc trả lời cuối của admin (mở lại nếu đã đóng). */
  async touchAfterAdminReply(client, ticketId) {
    const { rows } = await client.query(
      `UPDATE support_tickets
          SET status = 'awaiting_user', last_message_at = NOW(), last_admin_reply_at = NOW(),
              closed_at = NULL, closed_by = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING id, user_id, workspace_owner_id, subject, category, status, last_message_at,
                  last_admin_reply_at, closed_at, closed_by, created_at, updated_at`,
      [ticketId]
    );
    return rows[0] || null;
  }

  /**
   * Đổi trạng thái. `closed` ghi `closed_at` + `closed_by` (NULL = hệ thống tự đóng); trạng thái khác xoá hai trường đó.
   */
  async setStatus(client, ticketId, status, closedBy = null) {
    const { rows } = await client.query(
      `UPDATE support_tickets
          SET status = $2::varchar,
              closed_at = CASE WHEN $2::varchar = 'closed' THEN NOW() ELSE NULL END,
              closed_by = CASE WHEN $2::varchar = 'closed' THEN $3::int ELSE NULL END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, user_id, workspace_owner_id, subject, category, status, last_message_at,
                  last_admin_reply_at, closed_at, closed_by, created_at, updated_at`,
      [ticketId, status, closedBy]
    );
    return rows[0] || null;
  }

  /**
   * Ticket kèm thông tin người tạo. `userId` truyền vào = chỉ trả khi ticket là của người đó (null cho admin).
   *
   * @param {number|string} ticketId
   * @param {{ userId?: number|null }} [scope]
   * @returns {Promise<object|null>}
   */
  async findById(ticketId, { userId = null } = {}) {
    const params = [ticketId];
    let scope = '';
    if (userId != null) {
      params.push(userId);
      scope = 'AND t.user_id = $2';
    }
    const { rows } = await db.query(
      `SELECT ${TICKET_COLUMNS}, ${USER_COLUMNS}
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
        WHERE t.id = $1 ${scope}
        LIMIT 1`,
      params
    );
    return rows[0] || null;
  }

  /** Mọi tin của ticket theo thứ tự thời gian, kèm tên tác giả. */
  async listMessages(ticketId) {
    const { rows } = await db.query(
      `SELECT m.id, m.ticket_id, m.author_user_id, m.author_role, m.body, m.attachments, m.created_at,
              u.full_name AS author_full_name, u.username AS author_username
         FROM support_ticket_messages m
         LEFT JOIN users u ON u.id = m.author_user_id
        WHERE m.ticket_id = $1
        ORDER BY m.created_at ASC, m.id ASC`,
      [ticketId]
    );
    return rows;
  }

  /**
   * Danh sách ticket (người dùng: truyền `userId`; admin: bỏ trống) kèm tin cuối + số tin.
   *
   * @param {{ userId?: number|null, status?: string|null, category?: string|null, search?: string|null, page: number, limit: number }} input
   * @returns {Promise<{ rows: object[], total: number }>}
   */
  async list({ userId = null, status = null, category = null, search = null, page, limit }) {
    const { where, params } = buildWhere({ userId, status, category, search });
    const offset = (page - 1) * limit;
    const [listResult, countResult] = await Promise.all([
      db.query(
        `SELECT ${TICKET_COLUMNS}, ${USER_COLUMNS},
                lm.author_role AS last_author_role, lm.excerpt AS last_excerpt, lm.created_at AS last_message_created_at,
                (SELECT COUNT(*)::int FROM support_ticket_messages c WHERE c.ticket_id = t.id) AS message_count
           FROM support_tickets t
           JOIN users u ON u.id = t.user_id
           LEFT JOIN LATERAL (
             SELECT author_role, LEFT(body, 200) AS excerpt, created_at
               FROM support_ticket_messages
              WHERE ticket_id = t.id
              ORDER BY created_at DESC, id DESC
              LIMIT 1
           ) lm ON TRUE
           ${where}
          ORDER BY t.last_message_at DESC, t.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      db.query(
        `SELECT COUNT(*)::int AS total
           FROM support_tickets t
           JOIN users u ON u.id = t.user_id
           ${where}`,
        params
      ),
    ]);
    return { rows: listResult.rows, total: countResult.rows[0]?.total ?? 0 };
  }

  /**
   * Đếm ticket theo từng trạng thái (bỏ lọc status, giữ lọc category / tìm kiếm) cho các tab của màn admin.
   *
   * @returns {Promise<{ open: number, awaiting_user: number, closed: number }>}
   */
  async countByStatus({ userId = null, category = null, search = null } = {}) {
    const { where, params } = buildWhere({ userId, category, search }, { ignoreStatus: true });
    const { rows } = await db.query(
      `SELECT t.status, COUNT(*)::int AS total
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
         ${where}
        GROUP BY t.status`,
      params
    );
    const counts = { open: 0, awaiting_user: 0, closed: 0 };
    for (const row of rows) {
      if (row.status in counts) counts[row.status] = row.total;
    }
    return counts;
  }

  /**
   * Tin của ticket có kèm tệp `objectId` trong `attachments` — trả mục đính kèm (tên, mime...) hoặc null.
   *
   * @param {number|string} ticketId
   * @param {number|string} objectId
   * @returns {Promise<{ storageObjectId: number, key: string, name: string, size: number, mime: string }|null>}
   */
  async findAttachmentInTicket(ticketId, objectId) {
    const { rows } = await db.query(
      `SELECT att AS attachment
         FROM support_ticket_messages m
         CROSS JOIN LATERAL jsonb_array_elements(m.attachments) AS att
        WHERE m.ticket_id = $1 AND att->>'storageObjectId' = $2::text
        LIMIT 1`,
      [ticketId, String(objectId)]
    );
    return rows[0]?.attachment || null;
  }

  /**
   * Cron auto-close: đóng ticket `awaiting_user` không ai đụng tới quá `days` ngày (`updated_at` đổi theo mọi tin nhắn / đổi trạng thái).
   * `FOR UPDATE SKIP LOCKED` để không đè lên admin đang trả lời đúng ticket đó.
   *
   * @param {{ days: number, limit?: number }} input
   * @returns {Promise<Array<{ id: number, user_id: number, subject: string, closed_at: Date }>>}
   */
  async closeStaleAwaitingUser({ days, limit = 500 }) {
    const { rows } = await db.query(
      `WITH stale AS (
         SELECT id
           FROM support_tickets
          WHERE status = 'awaiting_user' AND updated_at < NOW() - make_interval(days => $1::int)
          ORDER BY updated_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       UPDATE support_tickets t
          SET status = 'closed', closed_at = NOW(), closed_by = NULL, updated_at = NOW()
         FROM stale
        WHERE t.id = stale.id
        RETURNING t.id, t.user_id, t.subject, t.closed_at`,
      [days, limit]
    );
    return rows;
  }
}

export default new SupportTicketRepository();
