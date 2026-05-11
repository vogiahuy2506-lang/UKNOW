import db from '../config/database.js';

export async function createContactSubmission({ name, email, phone, company, companySize, message, ipAddress }) {
  const { rows } = await db.query(
    `INSERT INTO contact_submissions (name, email, phone, company, company_size, message, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, email, created_at AS "createdAt"`,
    [name, email, phone || null, company || null, companySize || null, message || null, ipAddress || null]
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
