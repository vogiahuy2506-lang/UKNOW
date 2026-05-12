/**
 * Helpers thao tác DB cho integration test.
 *
 * Mỗi helper dùng pool từ src/config/database.js để cùng kết nối với app.
 */
import bcrypt from 'bcryptjs';
import db from '../../../src/config/database.js';

/**
 * Truncate hết bảng dữ liệu giữa các test để bảo đảm test idempotent.
 * Không truncate schema_migrations để khỏi rerun bootstrap.
 */
export async function truncateAll() {
  await db.query(`
    TRUNCATE TABLE
      contact_submissions,
      login_history,
      refresh_tokens,
      verification_codes,
      user_members,
      orders,
      plans,
      users
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Tạo 1 user trong DB. Trả về object đầy đủ row.
 *
 * @param {object} overrides
 * @returns {Promise<object>}
 */
export async function createUser(overrides = {}) {
  const password = overrides.password || 'Passw0rd!';
  const passwordHash = await bcrypt.hash(password, 4); // cost thấp cho test cho nhanh
  const username = overrides.username || `user${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const email = overrides.email || `${username}@test.local`;

  const result = await db.query(
    `INSERT INTO users (username, email, password_hash, full_name, status, is_verified, verified_at, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW(), NOW())
     RETURNING id, username, email, full_name, avatar_url, status, role, active_plan_id`,
    [
      username,
      email,
      passwordHash,
      overrides.fullName ?? `Test ${username}`,
      overrides.status ?? 'active',
      overrides.isVerified ?? true,
      overrides.role ?? 'user',
    ]
  );

  return { ...result.rows[0], plainPassword: password };
}

/**
 * Tạo mã verification để dùng cho register flow.
 * @param {object} input
 * @returns {Promise<{ code: string, email: string }>}
 */
export async function createVerificationCode({
  email,
  code = '123456',
  type = 'email_verification',
  expiresAt = new Date(Date.now() + 15 * 60 * 1000),
}) {
  await db.query(
    `INSERT INTO verification_codes (email, code, type, is_used, expires_at, created_at)
     VALUES ($1, $2, $3, FALSE, $4, NOW())`,
    [email, code, type, expiresAt]
  );
  return { email, code };
}

/**
 * Tạo plan trong DB. Tiện cho test admin/plans hoặc payment.
 *
 * @param {object} overrides
 * @returns {Promise<object>} row plan đã tạo
 */
export async function createPlan(overrides = {}) {
  const code = overrides.code || `plan_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const name = overrides.name || `Plan ${code}`;
  const price = overrides.price ?? 100000;
  const isCustom = overrides.isCustom ?? false;
  const isActive = overrides.isActive ?? true;
  const maxEmployees = overrides.maxEmployees ?? 5;

  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, description, features, max_employees, is_active, is_custom,
                        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      code,
      name,
      price,
      overrides.description ?? null,
      JSON.stringify(overrides.features ?? []),
      maxEmployees,
      isActive,
      isCustom,
      overrides.dailyEmailLimit ?? null,
      overrides.monthlyEmailLimit ?? null,
      overrides.dailyZaloLimit ?? null,
      overrides.monthlyZaloLimit ?? null,
    ]
  );
  return rows[0];
}

/**
 * Gán plan vào user (set active_plan_id).
 */
export async function assignPlanToUser(userId, planId) {
  await db.query(`UPDATE users SET active_plan_id = $1 WHERE id = $2`, [planId, userId]);
}

/**
 * Tạo order tham chiếu một plan — dùng để test soft delete behavior.
 */
export async function createOrder({ planId, userId, userEmail, status = 'success', amount = 100000 }) {
  const orderCode = Date.now() + Math.floor(Math.random() * 1000);
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orderCode, planId, amount, userEmail, userId, status]
  );
  return rows[0];
}

/**
 * Đóng pool sau khi tất cả test xong (gọi trong globalTeardown hoặc afterAll).
 */
export async function closePool() {
  await db.pool.end();
}
