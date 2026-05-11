import db from '../../config/database.js';

export async function findAllPlans() {
  const { rows } = await db.query(
    `SELECT id, code, name, price, description, features, is_active AS "isActive", is_custom AS "isCustom", max_employees AS "maxEmployees",
            daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit", 
            daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM plans WHERE is_custom = FALSE ORDER BY price ASC, id ASC`
  );
  return rows;
}

/** Lấy tất cả gói riêng (is_custom = true) kèm thông tin user và trạng thái thanh toán.
 *  showHidden = true → bao gồm cả gói đã ẩn (is_active = false) */
export async function findCustomPlans({ showHidden = false } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (p.id)
            p.id, p.code, p.name, p.price, p.description, p.is_active AS "isActive", p.is_custom AS "isCustom",
            p.max_employees AS "maxEmployees", p.daily_email_limit AS "dailyEmailLimit", p.monthly_email_limit AS "monthlyEmailLimit",
            p.daily_zalo_limit AS "dailyZaloLimit", p.monthly_zalo_limit AS "monthlyZaloLimit", p.created_at AS "createdAt",
            COALESCE(u.email,     o_user.email)     AS "assignedEmail",
            COALESCE(u.full_name, o_user.full_name) AS "assignedName",
            COALESCE(u.id,        o_user.id)        AS "assignedUserId",
            (u.id IS NOT NULL)                      AS "isActivated",
            o.status AS "paymentStatus"
     FROM plans p
     LEFT JOIN users  u      ON u.active_plan_id = p.id AND u.role = 'user'
     LEFT JOIN orders o      ON o.plan_id = p.id
     LEFT JOIN users  o_user ON o.user_id  = o_user.id
     WHERE p.is_custom = TRUE ${showHidden ? '' : 'AND p.is_active = TRUE'}
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

/** Đếm số order tham chiếu đến plan — dùng để quyết định hard/soft delete. */
export async function countOrdersForPlan(planId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM orders WHERE plan_id = $1`,
    [planId]
  );
  return rows[0]?.count || 0;
}

/** Soft delete — ẩn gói nhưng giữ lại để các FK (orders, users) còn dùng được. */
export async function softDeletePlan(id) {
  const { rows } = await db.query(
    `UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name`,
    [id]
  );
  return rows[0] || null;
}

/** Gỡ plan khỏi tất cả user đang active — dùng cho custom plan khi ẩn (vì plan này chỉ phục vụ user đó).
 *  Trả về danh sách email đã bị gỡ để admin biết. */
export async function unassignPlanFromUsers(planId) {
  const { rows } = await db.query(
    `UPDATE users
        SET active_plan_id = NULL, updated_at = NOW()
      WHERE active_plan_id = $1
      RETURNING email, full_name AS "fullName"`,
    [planId]
  );
  return rows;
}

/** Tìm user_admin theo email gần đúng để autocomplete */
export async function searchUserAdminsByEmail(query, limit = 8, excludeWithPlan = false) {
  const { rows } = await db.query(
    `SELECT id, email, full_name AS "fullName", active_plan_id AS "activePlanId"
     FROM users
     WHERE role = 'user'
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
    `SELECT id, username, email, full_name AS "fullName", role, active_plan_id AS "activePlanId" FROM users WHERE email = $1`,
    [email]
  );
  return rows[0] || null;
}

/** Gán gói trực tiếp cho user (bỏ qua flow thanh toán) — cũng set subscription_expires_at. */
export async function assignPlanToUser(userId, planId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = CASE
             WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
               THEN subscription_expires_at + INTERVAL '1 month'
             ELSE NOW() + INTERVAL '1 month'
           END,
           subscription_reminder_count = 0,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, username, email, full_name AS "fullName", active_plan_id AS "activePlanId", subscription_expires_at AS "subscriptionExpiresAt"`,
      [planId, userId]
    );
    const user = userResult.rows[0];
    if (!user) { await client.query('ROLLBACK'); return null; }

    const planResult = await client.query(`SELECT price FROM plans WHERE id = $1`, [planId]);
    const price = planResult.rows[0]?.price ?? 0;
    const orderCode = Date.now();
    await client.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'success', NOW())`,
      [orderCode, planId, price, user.email, user.id]
    );

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Tạo gói custom + gán cho user trong một transaction.
 * `is_active = true` = "chưa bị admin xoá". Custom plan ẩn khỏi pricing nhờ filter `is_custom = false`.
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
       VALUES ($1,$2,$3,$4,'[]',$5,true,true,$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [code || null, name, price, description || null, maxEmployees,
       dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null]
    );
    const plan = planResult.rows[0];

    const userResult = await client.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = CASE
             WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
               THEN subscription_expires_at + INTERVAL '1 month'
             ELSE NOW() + INTERVAL '1 month'
           END,
           subscription_reminder_count = 0,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, username, email, full_name AS "fullName"`,
      [plan.id, userId]
    );
    const assignedUser = userResult.rows[0];

    const orderCode = Date.now();
    await client.query(
      `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'success', NOW())`,
      [orderCode, plan.id, plan.price ?? 0, assignedUser.email, assignedUser.id]
    );

    await client.query('COMMIT');
    return { plan, user: assignedUser };
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
    `SELECT active_plan_id AS "planId", COUNT(*) AS "userCount"
     FROM users WHERE active_plan_id IS NOT NULL AND role = 'user'
     GROUP BY active_plan_id`
  );
  return rows;
}
