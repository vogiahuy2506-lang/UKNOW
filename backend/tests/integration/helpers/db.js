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
/**
 * Chạy lại khi Postgres báo deadlock (SQLSTATE 40P01).
 *
 * Vì sao cần: `truncateAll()` chạy ở `beforeEach` của MỌI suite và lấy khoá
 * ACCESS EXCLUSIVE trên ~60 bảng cùng lúc. Integration chạy `--runInBand` nên công
 * việc bất đồng bộ còn sót của test trước (ghi `login_history`, audit log, reconcile
 * lưu trữ…) vẫn có thể đang giữ khoá dòng khi TRUNCATE bắt đầu → chờ vòng tròn →
 * Postgres giết một bên.
 *
 * Đây là nguyên nhân thật của chuyện integration đỏ giả ngẫu nhiên (đo 18/08/2026):
 * mỗi lần đỏ một suite khác nhau vì `beforeEach` ở đâu cũng có, còn chạy riêng từng
 * file thì luôn xanh vì không có việc sót từ suite trước.
 *
 * KHÔNG thêm 40P01 vào `isConnectionError` của `src/config/database.js`: ở production,
 * deadlock là dấu hiệu sai thứ tự khoá và phải lộ ra, không được âm thầm thử lại.
 * Tranh chấp lúc dọn bảng giữa các test thì khác — lành tính và thử lại được.
 */
async function retryOnDeadlock(operation, maxRetries = 5) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error?.code !== '40P01') throw error;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
  throw lastError;
}

export async function truncateAll() {
  // RESTART IDENTITY tái sử dụng user id giữa các test — phải xóa quota cache
  // (TTL 10s, key theo billingUserId) để limits/counts của test trước không
  // rò sang test sau trong cùng process (runInBand dùng chung process cho mọi file).
  _clearQuotaCache();
  await retryOnDeadlock(() => db.query(`
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
      template_labels,
      email_settings,
      contact_submissions,
      login_history,
      refresh_tokens,
      verification_codes,
      user_members,
      voucher_redemptions,
      vouchers,
      scheduled_plan_changes,
      topup_grants,
      help_unanswered,
      help_article_chunks,
      help_article_media,
      help_articles,
      orders,
      webchat_messages,
      webchat_conversations,
      web_widget_configs,
      chatbot_studio_messages,
      chatbot_studio_conversations,
      custom_chatbots,
      chat_attachments,
      sub_assistants,
      plans,
      users
    RESTART IDENTITY CASCADE
  `));
}

/**
 * Tạo 1 user trong DB. Trả về object đầy đủ row.
 *
 * @param {object} overrides
 * @returns {Promise<object>}
 */
/**
 * Gói mặc định cho user test.
 *
 * `requireActivePlan` (authorization.middleware.js) trả 403 khi `users.active_plan_id`
 * rỗng, và nó gác hầu hết route nghiệp vụ. Không gán gói thì ~226 bài đỏ vì 403.
 *
 * Gói này cố ý `is_active = false` VÀ `is_custom = false` để vô hình với:
 *   - `findAllPlans()` — lọc `is_active = true` → không lọt vào guardrail gói tự chọn
 *   - `deleteOrphanCustomPlans()` — chỉ đụng `is_custom = true`
 * Hạn mức để NULL = không giới hạn, tránh vướng quota ngoài ý muốn.
 * `requireActivePlan` chỉ đọc id nên hai cờ trên không ảnh hưởng.
 */
const TEST_PLAN_CODE = '__test_default_plan';

async function ensureDefaultTestPlan() {
  const existing = await db.query(`SELECT id FROM plans WHERE code = $1`, [TEST_PLAN_CODE]);
  if (existing.rows[0]) return existing.rows[0].id;

  // Hạn mức phải ghi RÕ số lớn, không để NULL: tầng quota coi NULL là "chưa cấu hình"
  // rồi rơi về mặc định 1 → test đụng trần "đã đạt giới hạn tài khoản Email (1)".
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, description, features,
                        is_active, is_custom, duration_days,
                        max_employees, max_campaigns, max_zalo_campaigns,
                        max_zalo_group_campaigns, max_email_campaigns,
                        max_zalo_accounts, max_email_accounts,
                        max_email_templates, max_zalo_templates,
                        max_landing_pages, max_chatbots,
                        monthly_email_limit, monthly_zalo_limit,
                        daily_email_limit, daily_zalo_limit,
                        ai_credits_per_period)
     VALUES ($1, 'Gói mặc định cho test', 0, NULL, '[]'::jsonb,
             FALSE, FALSE, 3650,
             1000, 1000, 1000,
             1000, 1000,
             1000, 1000,
             1000, 1000,
             1000, 1000,
             1000000, 1000000,
             1000000, 1000000,
             1000000)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [TEST_PLAN_CODE]
  );
  return rows[0].id;
}

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

  const user = result.rows[0];

  // Admin bỏ qua requireActivePlan (isSuperAdmin → next) nên không cần gán gói —
  // gán vào chỉ làm bẩn các bài đếm plan/user_count ở admin.
  // withPlan: false → giữ user không có gói (để test đúng nhánh 403 NO_ACTIVE_PLAN)
  const wantsPlan = overrides.withPlan !== false && (overrides.role ?? 'user') !== 'admin';
  if (wantsPlan) {
    const planId = overrides.planId ?? (await ensureDefaultTestPlan());
    // Hạn mức tài nguyên đọc từ CỘT TRÊN users (userResourceLimit.util.js), không
    // phải từ plan — production copy sang user lúc kích hoạt gói. Test bỏ qua bước
    // đó nên phải set tay, nếu không NULL sẽ rơi về mặc định 1 ("đã đạt giới hạn").
    await db.query(
      `UPDATE users
         SET active_plan_id = $1,
             subscription_expires_at = NOW() + INTERVAL '365 days',
             max_employees = 1000, max_campaigns = 1000,
             max_zalo_campaigns = 1000, max_zalo_group_campaigns = 1000,
             max_email_campaigns = 1000, max_zalo_accounts = 1000,
             max_email_accounts = 1000, max_email_templates = 1000,
             max_zalo_templates = 1000, max_landing_pages = 1000
       WHERE id = $2`,
      [planId, user.id]
    );
    user.active_plan_id = planId;
  }

  return { ...user, plainPassword: password };
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
  const durationDays = overrides.durationDays ?? overrides.duration_days ?? 30;

  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, description, features, max_employees, is_active, is_custom,
                        daily_email_limit, monthly_email_limit, daily_zalo_limit, monthly_zalo_limit,
                        ai_credits_per_period, messages_per_period, duration_days, max_chatbots)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
      durationDays,
      overrides.maxChatbots ?? overrides.max_chatbots ?? null,
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
 * Seed một bản ghi zalo_messages cho delivery-monitor (không chứa SĐT/payload khách).
 *
 * @param {object} input
 * @param {number} input.campaignId
 * @param {number|null} [input.runId]
 * @param {number} input.accountId
 * @param {string} [input.accountName]
 * @param {'sent'|'failed'} [input.status]
 * @param {string|null} [input.errorCategory]
 * @param {Date|string} [input.createdAt]
 * @param {number} [input.count]
 */
export async function insertZaloMonitorMessages({
  campaignId,
  runId = null,
  accountId,
  accountName = 'Monitor Acc',
  status = 'failed',
  errorCategory = null,
  createdAt = new Date(),
  count = 1,
} = {}) {
  const metadata = {
    status,
    ...(errorCategory ? { errorCategory } : {}),
  };
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const { rows } = await db.query(
      `INSERT INTO zalo_messages
         (id_campaign, id_run, channel, status, account_id, account_name, tracking_metadata, created_at, updated_at)
       VALUES ($1, $2, 'zalo', $3, $4, $5, $6::jsonb, $7, $7)
       RETURNING id`,
      [campaignId, runId, status, accountId, accountName, JSON.stringify(metadata), createdAt]
    );
    ids.push(rows[0].id);
  }
  return ids;
}

/**
 * Đóng pool sau khi tất cả test xong (gọi trong globalTeardown hoặc afterAll).
 */
export async function closePool() {
  await db.pool.end();
}
