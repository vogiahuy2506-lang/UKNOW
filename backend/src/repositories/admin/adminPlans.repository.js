import db from '../../config/database.js';

export async function findAllPlans() {
  const { rows } = await db.query(
    `SELECT id, code, name, price, description, features, is_active, is_custom, max_employees,
            daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
            created_at, updated_at
     FROM plans WHERE is_custom = FALSE ORDER BY price ASC, id ASC`
  );
  return rows;
}

/** Lấy tất cả gói riêng (is_custom = true) kèm thông tin user và trạng thái thanh toán */
export async function findCustomPlans() {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (p.id)
            p.id, p.code, p.name, p.price, p.description, p.is_active, p.is_custom,
            p.max_employees, p.daily_email_limit, p.monthly_email_limit,
            p.daily_zalo_limit, p.monthly_zalo_limit, p.created_at,
            COALESCE(u.email,    o_user.email)     AS assigned_email,
            COALESCE(u.full_name, o_user.full_name) AS assigned_name,
            COALESCE(u.id,        o_user.id)        AS assigned_user_id,
            o.status AS payment_status
     FROM plans p
     LEFT JOIN users  u      ON u.active_plan_id = p.id AND u.role = 'user_admin'
     LEFT JOIN orders o      ON o.plan_id = p.id
     LEFT JOIN users  o_user ON o.user_id  = o_user.id
     WHERE p.is_custom = TRUE
     ORDER BY p.id, o.created_at DESC NULLS LAST`
  );
  return rows;
}

export async function findPlanById(id) {
  const { rows } = await db.query(`SELECT * FROM plans WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createPlan({ code, name, price, description, features, maxEmployees, isActive,
  isCustom = false, dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit }) {
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, description, features, max_employees, is_active, is_custom,
                        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
     RETURNING *`,
    [code, name, price, description || null, JSON.stringify(features || []), maxEmployees, isActive,
     isCustom, dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null]
  );
  return rows[0];
}

export async function updatePlan(id, { name, price, description, features, maxEmployees, isActive,
  dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit }) {
  const { rows } = await db.query(
    `UPDATE plans
     SET name = $1, price = $2, description = $3, features = $4,
         max_employees = $5, is_active = $6,
         daily_email_limit = $7, monthly_email_limit = $8,
         daily_zalo_limit = $9, monthly_zalo_limit = $10,
         updated_at = NOW()
     WHERE id = $11
     RETURNING *`,
    [name, price, description || null, JSON.stringify(features || []), maxEmployees, isActive,
     dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null, id]
  );
  return rows[0] || null;
}

export async function deletePlan(id) {
  const { rows } = await db.query(`DELETE FROM plans WHERE id = $1 RETURNING id`, [id]);
  return rows[0] || null;
}

/** Tìm user_admin theo email gần đúng để autocomplete */
export async function searchUserAdminsByEmail(query, limit = 8, excludeWithPlan = false) {
  const { rows } = await db.query(
    `SELECT id, email, full_name, active_plan_id
     FROM users
     WHERE role = 'user_admin'
       AND email ILIKE $1
       ${excludeWithPlan ? 'AND active_plan_id IS NULL' : ''}
     ORDER BY email ASC
     LIMIT $2`,
    [`%${query}%`, limit]
  );
  return rows;
}

/** Tìm user_admin theo email để gán gói trực tiếp */
export async function findUserAdminByEmail(email) {
  const { rows } = await db.query(
    `SELECT id, username, email, full_name, role, active_plan_id FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

/** Gán gói trực tiếp cho user (bỏ qua flow thanh toán) */
export async function assignPlanToUser(userId, planId) {
  const { rows } = await db.query(
    `UPDATE users SET active_plan_id = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, username, email, full_name, active_plan_id`,
    [planId, userId]
  );
  return rows[0] || null;
}

/**
 * Tạo gói custom + gán cho user trong một transaction.
 * Gói được tạo với is_active = false (ẩn khỏi trang pricing công khai).
 */
export async function createAndAssignCustomPlan(userId, { code, name, price, description, maxEmployees,
  dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const planResult = await client.query(
      `INSERT INTO plans (code, name, price, description, features, max_employees, is_active, is_custom,
                          daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                          created_at, updated_at)
       VALUES ($1,$2,$3,$4,'[]',$5,false,true,$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [code || null, name, price, description || null, maxEmployees,
       dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null]
    );
    const plan = planResult.rows[0];

    const userResult = await client.query(
      `UPDATE users SET active_plan_id = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, username, email, full_name`,
      [plan.id, userId]
    );

    await client.query('COMMIT');
    return { plan, user: userResult.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Lấy số lượng user đang dùng từng plan */
export async function getPlanUserCounts() {
  const { rows } = await db.query(
    `SELECT active_plan_id AS plan_id, COUNT(*) AS user_count
     FROM users WHERE active_plan_id IS NOT NULL AND role = 'user_admin'
     GROUP BY active_plan_id`
  );
  return rows;
}
