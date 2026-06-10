import db from '../../config/database.js';

/** Chuẩn hoá giá trị BIGINT nullable — tránh lỗi `invalid input syntax for type bigint: ""`. */
const toNullableBigint = (v) => (v === '' || v === null || v === undefined ? null : v);

const PLAN_COLS = `
  id, code, name, price, price_yearly AS "priceYearly", description, features,
  is_active AS "isActive", is_custom AS "isCustom",
  max_employees AS "maxEmployees",
  duration_days AS "durationDays",
  daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit",
  daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit",
  messages_per_period AS "messagesPerPeriod", is_fup_enabled AS "isFupEnabled",
  max_landing_pages AS "maxLandingPages", max_campaigns AS "maxCampaigns",
  max_zalo_campaigns AS "maxZaloCampaigns",
  max_zalo_group_campaigns AS "maxZaloGroupCampaigns",
  max_email_campaigns AS "maxEmailCampaigns",
  max_zalo_accounts AS "maxZaloAccounts", max_email_accounts AS "maxEmailAccounts",
  max_email_templates AS "maxEmailTemplates", max_zalo_templates AS "maxZaloTemplates",
  max_chatbots AS "maxChatbots", ai_credits_per_period AS "aiCreditsPerPeriod",
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function findAllPlans() {
  const { rows } = await db.query(
    `SELECT ${PLAN_COLS} FROM plans WHERE is_custom = FALSE ORDER BY price ASC, id ASC`
  );
  return rows;
}

/** Lấy tất cả gói riêng (is_custom = true) kèm thông tin user và trạng thái thanh toán.
 *  showHidden = true → bao gồm cả gói đã ẩn (is_active = false) */
export async function findCustomPlans({ showHidden = false } = {}) {
  const { rows } = await db.query(
    `SELECT DISTINCT ON (p.id)
            p.id, p.code, p.name, p.price, p.price_yearly AS "priceYearly", p.description,
            p.is_active AS "isActive", p.is_custom AS "isCustom",
            p.max_employees AS "maxEmployees", p.daily_email_limit AS "dailyEmailLimit", p.monthly_email_limit AS "monthlyEmailLimit",
            p.daily_zalo_limit AS "dailyZaloLimit", p.monthly_zalo_limit AS "monthlyZaloLimit",
            p.messages_per_period AS "messagesPerPeriod", p.is_fup_enabled AS "isFupEnabled",
            p.duration_days AS "durationDays",
            p.max_landing_pages AS "maxLandingPages", p.max_campaigns AS "maxCampaigns",
            p.max_zalo_campaigns AS "maxZaloCampaigns",
            p.max_zalo_group_campaigns AS "maxZaloGroupCampaigns",
            p.max_email_campaigns AS "maxEmailCampaigns",
            p.max_zalo_accounts AS "maxZaloAccounts", p.max_email_accounts AS "maxEmailAccounts",
            p.max_email_templates AS "maxEmailTemplates", p.max_zalo_templates AS "maxZaloTemplates",
            p.max_chatbots AS "maxChatbots", p.ai_credits_per_period AS "aiCreditsPerPeriod",
            p.created_at AS "createdAt",
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

export async function findPlanByCode(code) {
  const { rows } = await db.query(`SELECT * FROM plans WHERE LOWER(code) = LOWER($1) LIMIT 1`, [code]);
  return rows[0] || null;
}

export async function createPlan({ code, name, price, priceYearly, description, features, maxEmployees, isActive,
  isCustom = false, durationDays, dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
  messagesPerPeriod, isFupEnabled,
  maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
  maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
  maxChatbots, aiCreditsPerPeriod }) {
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, price_yearly, description, features, max_employees, is_active, is_custom,
                        duration_days,
                        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                        messages_per_period, is_fup_enabled,
                        max_landing_pages, max_campaigns,
                        max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
                        max_zalo_accounts, max_email_accounts,
                        max_email_templates, max_zalo_templates,
                        max_chatbots, ai_credits_per_period,
                        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW(),NOW())
     RETURNING *`,
    [code, name, price, toNullableBigint(priceYearly), description || null, JSON.stringify(features || []), maxEmployees, isActive, isCustom,
     durationDays ?? null,
     dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null,
     messagesPerPeriod ?? null, isFupEnabled ?? false,
     maxLandingPages ?? null, maxCampaigns ?? null,
     maxZaloCampaigns ?? null, maxZaloGroupCampaigns ?? null, maxEmailCampaigns ?? null,
     maxZaloAccounts ?? null, maxEmailAccounts ?? null,
     maxEmailTemplates ?? null, maxZaloTemplates ?? null,
     maxChatbots ?? null, aiCreditsPerPeriod ?? null]
  );
  return rows[0];
}

export async function updatePlan(id, { name, price, priceYearly, description, features, maxEmployees, isActive,
  durationDays, dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
  messagesPerPeriod, isFupEnabled,
  maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
  maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
  maxChatbots, aiCreditsPerPeriod }) {
  const { rows } = await db.query(
    `UPDATE plans
     SET name = $1, price = $2, price_yearly = $3, description = $4, features = $5,
         max_employees = $6, is_active = $7,
         duration_days = $8,
         daily_email_limit = $9, monthly_email_limit = $10,
         daily_zalo_limit = $11, monthly_zalo_limit = $12,
         messages_per_period = $13, is_fup_enabled = $14,
         max_landing_pages = $15, max_campaigns = $16,
         max_zalo_campaigns = $17, max_zalo_group_campaigns = $18, max_email_campaigns = $19,
         max_zalo_accounts = $20, max_email_accounts = $21,
         max_email_templates = $22, max_zalo_templates = $23,
         max_chatbots = $24, ai_credits_per_period = $25,
         updated_at = NOW()
     WHERE id = $26
     RETURNING *`,
    [name, price, toNullableBigint(priceYearly), description || null, JSON.stringify(features || []), maxEmployees, isActive,
     durationDays ?? null,
     dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null,
     messagesPerPeriod ?? null, isFupEnabled ?? false,
     maxLandingPages ?? null, maxCampaigns ?? null,
     maxZaloCampaigns ?? null, maxZaloGroupCampaigns ?? null, maxEmailCampaigns ?? null,
     maxZaloAccounts ?? null, maxEmailAccounts ?? null,
     maxEmailTemplates ?? null, maxZaloTemplates ?? null,
     maxChatbots ?? null, aiCreditsPerPeriod ?? null, id]
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
    `SELECT id, username, email, full_name AS "fullName", role, active_plan_id AS "activePlanId"
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/** Gán gói trực tiếp cho user — sync resource limits từ plan vào users.max_* ngay lập tức.
 *  Thời hạn tính từ duration_days của plan; fallback 30 ngày nếu chưa set. */
export async function assignPlanToUser(userId, planId) {
  const { rows } = await db.query(
    `UPDATE users u
     SET active_plan_id            = p.id,
         subscription_expires_at   = CASE
           WHEN u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > NOW()
             THEN u.subscription_expires_at + (COALESCE(p.duration_days, 30) || ' days')::INTERVAL
           ELSE NOW()              + (COALESCE(p.duration_days, 30) || ' days')::INTERVAL
         END,
         subscription_reminder_count = 0,
         max_landing_pages         = p.max_landing_pages,
         max_campaigns             = p.max_campaigns,
         max_zalo_campaigns        = p.max_zalo_campaigns,
         max_zalo_group_campaigns  = p.max_zalo_group_campaigns,
         max_email_campaigns       = p.max_email_campaigns,
         max_zalo_accounts         = p.max_zalo_accounts,
         max_email_accounts        = p.max_email_accounts,
         max_email_templates       = p.max_email_templates,
         max_zalo_templates        = p.max_zalo_templates,
         messages_per_period       = p.messages_per_period,
         is_fup_enabled            = p.is_fup_enabled,
         updated_at = NOW()
     FROM plans p
     WHERE p.id = $1 AND u.id = $2
     RETURNING u.id, u.username, u.email, u.full_name AS "fullName",
               u.active_plan_id AS "activePlanId", u.subscription_expires_at AS "subscriptionExpiresAt"`,
    [planId, userId]
  );
  return rows[0] || null;
}

/**
 * Tạo gói custom + gán cho user trong một transaction.
 * `is_active = true` = "chưa bị admin xoá". Custom plan ẩn khỏi pricing nhờ filter `is_custom = false`.
 */
export async function createAndAssignCustomPlan(userId, { code, name, price, priceYearly, description, maxEmployees,
  durationDays, dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit,
  messagesPerPeriod, isFupEnabled,
  maxLandingPages, maxCampaigns, maxZaloCampaigns, maxZaloGroupCampaigns, maxEmailCampaigns,
  maxZaloAccounts, maxEmailAccounts, maxEmailTemplates, maxZaloTemplates,
  maxChatbots, aiCreditsPerPeriod }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const planResult = await client.query(
      `INSERT INTO plans (code, name, price, price_yearly, description, features, max_employees, is_active, is_custom,
                          duration_days,
                          daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                          messages_per_period, is_fup_enabled,
                          max_landing_pages, max_campaigns,
                          max_zalo_campaigns, max_zalo_group_campaigns, max_email_campaigns,
                          max_zalo_accounts, max_email_accounts,
                          max_email_templates, max_zalo_templates,
                          max_chatbots, ai_credits_per_period,
                          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,'[]',$6,true,true,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW(),NOW())
       RETURNING *`,
      [code || null, name, price, toNullableBigint(priceYearly), description || null, maxEmployees,
       durationDays ?? null,
       dailyEmailLimit ?? null, monthlyEmailLimit ?? null, dailyZaloLimit ?? null, monthlyZaloLimit ?? null,
       messagesPerPeriod ?? null, isFupEnabled ?? false,
       maxLandingPages ?? null, maxCampaigns ?? null,
       maxZaloCampaigns ?? null, maxZaloGroupCampaigns ?? null, maxEmailCampaigns ?? null,
       maxZaloAccounts ?? null, maxEmailAccounts ?? null,
       maxEmailTemplates ?? null, maxZaloTemplates ?? null,
       maxChatbots ?? null, aiCreditsPerPeriod ?? null]
    );
    const plan = planResult.rows[0];

    const userResult = await client.query(
      `UPDATE users
       SET active_plan_id = $1,
           subscription_expires_at = CASE
             WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
               THEN subscription_expires_at + (COALESCE($3, 30) || ' days')::INTERVAL
             ELSE NOW()              + (COALESCE($3, 30) || ' days')::INTERVAL
           END,
           subscription_reminder_count = 0,
           max_landing_pages = $4, max_campaigns = $5,
           max_zalo_campaigns = $6, max_zalo_group_campaigns = $7, max_email_campaigns = $8,
           max_zalo_accounts = $9, max_email_accounts = $10,
           max_email_templates = $11, max_zalo_templates = $12,
           messages_per_period = $13, is_fup_enabled = $14,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, username, email, full_name AS "fullName"`,
      [plan.id, userId,
       plan.duration_days,
       plan.max_landing_pages, plan.max_campaigns,
       plan.max_zalo_campaigns, plan.max_zalo_group_campaigns, plan.max_email_campaigns,
       plan.max_zalo_accounts, plan.max_email_accounts,
       plan.max_email_templates, plan.max_zalo_templates,
       plan.messages_per_period, plan.is_fup_enabled]
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
