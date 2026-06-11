import db from '../../config/database.js';

/**
 * Lấy tất cả email của user có gói đang active (role IN ('user', 'admin'))
 * Loại trừ super_admin (role = 'super_admin').
 * Chỉ lấy những user có email hợp lệ và đang active.
 */
export async function findAllActiveUserEmails() {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (u.email)
             u.id, u.email, u.full_name, u.username
       FROM users u
       WHERE u.email IS NOT NULL
         AND u.email != ''
         AND u.status = 'active'
         AND u.role IN ('user', 'admin')
       ORDER BY u.email, u.created_at ASC`
  );
  return rows;
}

/**
 * Lấy tổng số user có gói đang active và có email hợp lệ (để hiển thị preview).
 */
export async function countActiveUserEmails() {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT email) AS total
       FROM users
      WHERE email IS NOT NULL
        AND email != ''
        AND status = 'active'
        AND role IN ('user', 'admin')`
  );
  return parseInt(rows[0]?.total || 0, 10);
}
