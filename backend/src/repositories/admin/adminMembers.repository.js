import db from '../../config/database.js';

/**
 * Danh sách tất cả user_admin, kèm thông tin gói và số nhân viên.
 * Hỗ trợ tìm kiếm theo tên/email và lọc theo plan/status.
 */
export async function findAllMembers({ search, planId, status, expiry, role = 'user' } = {}) {
  const safeRole = role === 'admin' ? 'admin' : 'user';
  const conditions = [`u.role = '${safeRole}'`];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  if (planId === 'none') {
    conditions.push(`u.active_plan_id IS NULL`);
  } else if (planId === 'custom') {
    // Lọc user đang dùng gói riêng (enterprise)
    conditions.push(`EXISTS (SELECT 1 FROM plans p WHERE p.id = u.active_plan_id AND p.is_custom = TRUE)`);
  } else if (planId) {
    params.push(planId);
    conditions.push(`u.active_plan_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`u.status = $${params.length}`);
  }
  if (expiry === 'expiring') {
    conditions.push(`u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > NOW() AND u.subscription_expires_at <= NOW() + INTERVAL '7 days'`);
  } else if (expiry === 'expired') {
    conditions.push(`u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at < NOW() AND u.active_plan_id IS NULL`);
  }

  const where = conditions.join(' AND ');

  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT
         u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.created_at AS "createdAt",
         u.active_plan_id AS "activePlanId", u.subscription_expires_at AS "subscriptionExpiresAt",
         p.name AS "planName",
         p.code AS "planCode",
         (SELECT COUNT(*) FROM user_members um WHERE um.owner_id = u.id) AS "employeeCount"
       FROM users u
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ${where}
       ORDER BY u.subscription_expires_at ASC NULLS LAST, u.created_at DESC`,
      params
    ));
  } catch {
    // Fallback khi migration 007 chưa chạy (cột subscription_expires_at chưa có)
    ({ rows } = await db.query(
      `SELECT
         u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.created_at AS "createdAt",
         u.active_plan_id AS "activePlanId", NULL AS "subscriptionExpiresAt",
         p.name AS "planName",
         p.code AS "planCode",
         (SELECT COUNT(*) FROM user_members um WHERE um.owner_id = u.id) AS "employeeCount"
       FROM users u
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ${where}
       ORDER BY u.created_at DESC`,
      params
    ));
  }
  return rows;
}

export async function findMemberById(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.role, u.created_at AS "createdAt", 
            u.active_plan_id AS "activePlanId",
            p.name AS "planName", p.code AS "planCode"
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function setMemberStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = 'user'
     RETURNING id, status`,
    [status, id]
  );
  return rows[0] || null;
}

export async function promoteMemberToSuperAdmin(id) {
  const { rows } = await db.query(
    `UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = $1 AND role = 'user'
     RETURNING id, username, email, role`,
    [id]
  );
  return rows[0] || null;
}

export async function demoteMemberFromSuperAdmin(id) {
  const { rows } = await db.query(
    `UPDATE users SET role = 'user', updated_at = NOW() WHERE id = $1 AND role = 'admin'
     RETURNING id, username, email, role`,
    [id]
  );
  return rows[0] || null;
}

export async function countAdmins() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'`
  );
  return rows[0]?.total ?? 0;
}

export async function setMemberRole(id, role) {
  const { rows } = await db.query(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND role IN ('user', 'admin')
     RETURNING id, username, email, role`,
    [role, id]
  );
  return rows[0] || null;
}
