/**
 * Helpers thao tác DB cho integration test.
 *
 * Mỗi helper dùng pool từ src/config/database.js để cùng kết nối với app.
 */
import bcrypt from 'bcryptjs';
import db from '../../../src/config/database.js';
import { _clearQuotaCache } from '../../../src/utils/userSendLimit.util.js';

/**
 * Truncate hết bảng dữ liệu giữa các test để bảo đảm test idempotent.
 * Không truncate schema_migrations để khỏi rerun bootstrap.
 */
export async function truncateAll() {
  // RESTART IDENTITY tái sử dụng user id giữa các test — phải xóa quota cache
  // (TTL 10s, key theo billingUserId) để limits/counts của test trước không
  // rò sang test sau trong cùng process (runInBand dùng chung process cho mọi file).
  _clearQuotaCache();
  await db.query(`
    TRUNCATE TABLE
      usage_logs,
      dashboard_insights,
      landing_testimonials,
      landing_featured_courses,
      landing_pages,
      file_access_events,
      template_files,
      customer_journey,
      customer_purchases,
      campaign_participations,
      campaign_customers,
      zalo_messages,
      email_messages,
      courses,
      customers,
      landing_page_events,
      leads,
      tracking_short_links,
      campaign_schedules,
      campaign_executions,
      campaign_run_recipient_steps,
      campaign_runs,
      campaign_connections,
      campaign_nodes,
      campaigns,
      zalo_templates,
      zalo_accounts,
      zalo_unreachable_phones,
      zalo_settings,
      email_templates,
      email_settings,
      contact_submissions,
      login_history,
      refresh_tokens,
      verification_codes,
      user_members,
      voucher_redemptions,
      vouchers,
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
  const code = Object.prototype.hasOwnProperty.call(overrides, 'code')
    ? overrides.code
    : `plan_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const name = overrides.name || `Plan ${code || 'custom'}`;
  const price = overrides.price ?? 100000;
  const isCustom = overrides.isCustom ?? false;
  const isActive = overrides.isActive ?? true;
  const maxEmployees = overrides.maxEmployees ?? 5;

  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, description, features, max_employees, is_active, is_custom,
                        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                        ai_credits_per_period, messages_per_period)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
      overrides.aiCreditsPerPeriod ?? null,
      overrides.messagesPerPeriod ?? null,
    ]
  );
  return rows[0];
}

/**
 * Seed production-shaped public plans (migration 035 + 079).
 * max_chatbots left NULL on every plan (migration 054 added the column but never seeded).
 * Skip trial — guardrail already ignores price <= 0.
 */
export async function seedProductionPublicPlans() {
  const plans = [
    {
      code: 'starter',
      name: 'Starter',
      price: 299000,
      price_yearly: 2691000,
      max_employees: 1,
      monthly_email_limit: 500,
      monthly_zalo_limit: 1000,
      ai_credits_per_period: 500,
      max_landing_pages: 2,
      max_campaigns: 3,
      max_zalo_campaigns: 2,
      max_zalo_group_campaigns: 2,
      max_email_campaigns: 1,
      max_zalo_accounts: 1,
      max_email_accounts: 1,
      max_email_templates: 10,
      max_zalo_templates: 10,
      max_chatbots: null,
    },
    {
      code: 'basic',
      name: 'Basic',
      price: 599000,
      price_yearly: 5391000,
      max_employees: 3,
      monthly_email_limit: 2000,
      monthly_zalo_limit: 5000,
      ai_credits_per_period: 3000,
      max_landing_pages: 5,
      max_campaigns: 10,
      max_zalo_campaigns: 5,
      max_zalo_group_campaigns: 5,
      max_email_campaigns: 3,
      max_zalo_accounts: 2,
      max_email_accounts: 2,
      max_email_templates: 25,
      max_zalo_templates: 25,
      max_chatbots: null,
    },
    {
      code: 'professional',
      name: 'Professional',
      price: 1299000,
      price_yearly: 11691000,
      max_employees: 10,
      monthly_email_limit: 10000,
      monthly_zalo_limit: 20000,
      ai_credits_per_period: null,
      max_landing_pages: 15,
      max_campaigns: null,
      max_zalo_campaigns: null,
      max_zalo_group_campaigns: null,
      max_email_campaigns: null,
      max_zalo_accounts: 5,
      max_email_accounts: 5,
      max_email_templates: 100,
      max_zalo_templates: 100,
      max_chatbots: null,
    },
    {
      code: 'enterprise',
      name: 'Enterprise',
      price: 2999000,
      price_yearly: 26991000,
      max_employees: 50,
      monthly_email_limit: null,
      monthly_zalo_limit: null,
      ai_credits_per_period: null,
      max_landing_pages: null,
      max_campaigns: null,
      max_zalo_campaigns: null,
      max_zalo_group_campaigns: null,
      max_email_campaigns: null,
      max_zalo_accounts: null,
      max_email_accounts: null,
      max_email_templates: null,
      max_zalo_templates: null,
      max_chatbots: null,
    },
  ];

  const rows = [];
  for (const p of plans) {
    const { rows: inserted } = await db.query(
      `INSERT INTO plans (
         code, name, price, price_yearly, description, features, max_employees,
         is_active, is_custom, duration_days,
         monthly_email_limit, monthly_zalo_limit, ai_credits_per_period,
         max_landing_pages, max_campaigns, max_zalo_campaigns, max_zalo_group_campaigns,
         max_email_campaigns, max_zalo_accounts, max_email_accounts,
         max_email_templates, max_zalo_templates, max_chatbots
       ) VALUES (
         $1,$2,$3,$4,$5,'[]'::jsonb,$6,
         TRUE, FALSE, 30,
         $7,$8,$9,
         $10,$11,$12,$13,
         $14,$15,$16,
         $17,$18,$19
       ) RETURNING *`,
      [
        p.code, p.name, p.price, p.price_yearly, `${p.name} plan`,
        p.max_employees,
        p.monthly_email_limit, p.monthly_zalo_limit, p.ai_credits_per_period,
        p.max_landing_pages, p.max_campaigns, p.max_zalo_campaigns, p.max_zalo_group_campaigns,
        p.max_email_campaigns, p.max_zalo_accounts, p.max_email_accounts,
        p.max_email_templates, p.max_zalo_templates, p.max_chatbots,
      ]
    );
    rows.push(inserted[0]);
  }
  return rows;
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
// Counter để bảo đảm order_code duy nhất khi tạo nhiều đơn liên tiếp trong 1 test.
// Dùng string vì BIGINT ngoài tầm Number.MAX_SAFE_INTEGER (~9e15) nếu nhân nhiều ms.
let _orderCodeCounter = 0;

export async function createOrder({
  planId,
  userId,
  userEmail,
  status = 'success',
  amount = 100000,
  paymentMethod = 'payos',
  note = null,
}) {
  _orderCodeCounter += 1;
  const orderCode = `${Date.now()}${String(_orderCodeCounter).padStart(6, '0')}`;
  const { rows } = await db.query(
    `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orderCode, planId, amount, userEmail, userId, status, paymentMethod, note]
  );
  return rows[0];
}

/**
 * Đóng pool sau khi tất cả test xong (gọi trong globalTeardown hoặc afterAll).
 */
export async function closePool() {
  await db.pool.end();
}
