import db from '../../config/database.js';

/**
 * Danh sách tất cả user_admin, kèm thông tin gói và số nhân viên.
 * Hỗ trợ tìm kiếm theo tên/email và lọc theo plan/status.
 */
export async function findAllMembers({ search, planId, status } = {}) {
  const conditions = [`u.role = 'user_admin'`];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  if (planId === 'none') {
    conditions.push(`u.active_plan_id IS NULL`);
  } else if (planId) {
    params.push(planId);
    conditions.push(`u.active_plan_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`u.status = $${params.length}`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT
       u.id, u.username, u.email, u.full_name, u.status, u.created_at,
       u.active_plan_id,
       p.name  AS plan_name,
       p.code  AS plan_code,
       (SELECT COUNT(*) FROM user_members um WHERE um.owner_id = u.id) AS employee_count
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE ${where}
     ORDER BY u.created_at DESC`,
    params
  );
  return rows;
}

export async function findMemberById(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.status, u.role, u.created_at, u.active_plan_id,
            p.name AS plan_name, p.code AS plan_code
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function setMemberStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = 'user_admin'
     RETURNING id, status`,
    [status, id]
  );
  return rows[0] || null;
}

export async function promoteMemberToSuperAdmin(id) {
  const { rows } = await db.query(
    `UPDATE users SET role = 'super_admin', updated_at = NOW() WHERE id = $1 AND role = 'user_admin'
     RETURNING id, username, email, role`,
    [id]
  );
  return rows[0] || null;
}
