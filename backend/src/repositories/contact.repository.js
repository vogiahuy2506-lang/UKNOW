import db from '../config/database.js';

export async function createContactSubmission({ name, email, phone, company, message, ipAddress }) {
  const { rows } = await db.query(
    `INSERT INTO contact_submissions (name, email, phone, company, message, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, created_at AS "createdAt"`,
    [name, email, phone || null, company || null, message || null, ipAddress || null]
  );
  return rows[0];
}

/**
 * Đếm số submission từ cùng email trong N phút gần đây — chống spam.
 */
export async function countRecentSubmissionsByEmail(email, withinMinutes = 5) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM contact_submissions
     WHERE email = $1 AND created_at > NOW() - INTERVAL '${withinMinutes} minutes'`,
    [email]
  );
  return rows[0]?.count || 0;
}

const CONTACT_COLUMNS = `id, name, email, phone, company, company_size, message, status, notes, created_at, updated_at`;

/**
 * PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-4 — màn admin đọc `contact_submissions` (trước đây không màn nào đọc bảng này).
 * `search` khớp tên / email / điện thoại / công ty / nội dung; ký tự `%` `_` `\` của người dùng được escape.
 *
 * @param {{ status?: string|null, search?: string|null, page: number, limit: number }} input
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listContactSubmissions({ status = null, search = null, page, limit }) {
  const clauses = [];
  const params = [];
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const term = String(search || '').trim();
  if (term) {
    params.push(`%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    const like = `$${params.length}`;
    clauses.push(`(name ILIKE ${like} ESCAPE '\\' OR email ILIKE ${like} ESCAPE '\\' OR phone ILIKE ${like} ESCAPE '\\'
      OR company ILIKE ${like} ESCAPE '\\' OR message ILIKE ${like} ESCAPE '\\')`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const [listResult, countResult] = await Promise.all([
    db.query(
      `SELECT ${CONTACT_COLUMNS}
         FROM contact_submissions
         ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM contact_submissions ${where}`, params),
  ]);
  return { rows: listResult.rows, total: countResult.rows[0]?.total ?? 0 };
}

/**
 * Đếm liên hệ theo từng trạng thái (tab của màn admin). Dòng có `status` NULL tính là 'new' (cột có DEFAULT nhưng không NOT NULL).
 *
 * @returns {Promise<{ new: number, contacted: number, qualified: number, closed: number }>}
 */
export async function countContactSubmissionsByStatus() {
  const { rows } = await db.query(
    `SELECT COALESCE(status, 'new') AS status, COUNT(*)::int AS total
       FROM contact_submissions
      GROUP BY COALESCE(status, 'new')`
  );
  const counts = { new: 0, contacted: 0, qualified: 0, closed: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status] = row.total;
  }
  return counts;
}

/**
 * Đổi trạng thái / ghi chú nội bộ của một liên hệ. Chỉ cột được truyền (khác `undefined`) mới đổi. Không có dòng → null.
 *
 * @param {number|string} id
 * @param {{ status?: string, notes?: string|null }} patch
 * @returns {Promise<object|null>}
 */
export async function updateContactSubmission(id, { status, notes }) {
  const sets = [];
  const params = [id];
  if (status !== undefined) {
    params.push(status);
    sets.push(`status = $${params.length}`);
  }
  if (notes !== undefined) {
    params.push(notes);
    sets.push(`notes = $${params.length}`);
  }
  if (!sets.length) return null;
  const { rows } = await db.query(
    `UPDATE contact_submissions
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING ${CONTACT_COLUMNS}`,
    params
  );
  return rows[0] || null;
}
