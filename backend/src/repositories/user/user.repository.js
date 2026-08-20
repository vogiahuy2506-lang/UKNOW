import db from '../../config/database.js';
import { EFFECTIVE_PLAN_ID_SQL } from '../../utils/billingCycle.util.js';

const PROFILE_LIMIT_COLUMNS = `
  u.max_campaigns,
  u.max_zalo_accounts,
  u.max_email_accounts,
  u.max_email_templates,
  u.max_zalo_templates,
  u.max_landing_pages
`;

const PLAN_COLUMNS = `
  p.id          AS plan_id,
  p.name        AS plan_name,
  p.code        AS plan_code,
  p.price       AS plan_price,
  p.features    AS plan_features,
  p.is_custom   AS plan_is_custom,
  p.max_employees AS plan_max_employees,
  p.daily_email_limit,
  p.monthly_email_limit,
  p.daily_zalo_limit,
  p.monthly_zalo_limit,
  p.ai_tokens_per_period,
  p.ai_credits_per_period,
  p.grace_period_days
`;

/** Core plan columns only — safe when limit/AI token columns are missing from schema. */
const PLAN_COLUMNS_FALLBACK = `
  p.id          AS plan_id,
  p.name        AS plan_name,
  p.code        AS plan_code,
  p.price       AS plan_price,
  p.features    AS plan_features,
  NULL::boolean AS plan_is_custom,
  p.max_employees AS plan_max_employees,
  NULL::int AS daily_email_limit,
  NULL::int AS monthly_email_limit,
  NULL::int AS daily_zalo_limit,
  NULL::int AS monthly_zalo_limit,
  NULL::int AS ai_tokens_per_period,
  NULL::int AS ai_credits_per_period,
  NULL::int AS grace_period_days
`;

const PROFILE_PLAN_WHERE = `
  WHERE p.id = COALESCE(
    $1::int,
    (SELECT o.plan_id FROM orders o
     WHERE o.user_id = $2 OR o.user_email = $3
     ORDER BY o.created_at DESC LIMIT 1)
  )
`;

export async function findUserById(userId, queryable = db) {
  if (!userId) return null;
  const result = await queryable.query(
    `SELECT id, email, full_name, role, active_plan_id, subscription_expires_at, plan_activated_at
     FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function findProfileBase(userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.phone, u.status,
            u.role, u.active_plan_id, u.subscription_expires_at,
            ${PROFILE_LIMIT_COLUMNS},
            u.bot_daily_reply_cap,
            u.ai_handoff_auto_resume_minutes,
            u.created_at, u.last_login_at, r.role_code, r.role_name
     FROM users u
     LEFT JOIN roles r ON u.id_role = r.id
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findProfileBaseFallback(userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.phone, u.status,
            u.role, u.active_plan_id,
            NULL AS subscription_expires_at,
            NULL::int AS max_campaigns, NULL::int AS max_zalo_accounts,
            NULL::int AS max_email_accounts, NULL::int AS max_email_templates,
            NULL::int AS max_zalo_templates, NULL::int AS max_landing_pages,
            NULL::int AS bot_daily_reply_cap,
            NULL::int AS ai_handoff_auto_resume_minutes,
            u.created_at, u.last_login_at, NULL AS role_code, NULL AS role_name
     FROM users u WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findProfilePlan({ activePlanId, userId, email }) {
  const { rows } = await db.query(
    `SELECT ${PLAN_COLUMNS}
     FROM plans p
     ${PROFILE_PLAN_WHERE}`,
    [activePlanId || null, userId, email]
  );
  return rows[0] || null;
}

export async function findProfilePlanFallback({ activePlanId, userId, email }) {
  const { rows } = await db.query(
    `SELECT ${PLAN_COLUMNS_FALLBACK}
     FROM plans p
     ${PROFILE_PLAN_WHERE}`,
    [activePlanId || null, userId, email]
  );
  return rows[0] || null;
}

export async function findProfilePlanByUserId(userId) {
  const { rows } = await db.query(
    `SELECT ${PLAN_COLUMNS}
     FROM users u
     JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findActiveBillingPeriod(userId, email) {
  try {
    const { rows } = await db.query(
      `SELECT billing_period FROM orders
       WHERE (user_id = $1 OR user_email = $2)
         AND status IN ('paid', 'success', 'completed')
         AND note IS DISTINCT FROM 'topup'
         AND note IS DISTINCT FROM 'scheduled_change'
         AND topup_config IS NULL
         AND plan_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [userId || null, email || null]
    );
    return rows[0]?.billing_period || 'monthly';
  } catch {
    return 'monthly';
  }
}

export async function findProfilePlanByUserIdFallback(userId) {
  const { rows } = await db.query(
    `SELECT ${PLAN_COLUMNS_FALLBACK}
     FROM users u
     JOIN plans p ON p.id = (${EFFECTIVE_PLAN_ID_SQL})
     WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findProfileUsageCounts(userId) {
  const { rows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE cj.event_type = 'email_sent'
         AND cj.created_at >= CURRENT_DATE) AS email_sent_today,
       COUNT(*) FILTER (WHERE cj.event_type = 'email_sent'
         AND cj.created_at >= date_trunc('month', CURRENT_DATE)) AS email_sent_month,
       COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent'
         AND cj.created_at >= CURRENT_DATE) AS zalo_sent_today,
       COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent'
         AND cj.created_at >= date_trunc('month', CURRENT_DATE)) AS zalo_sent_month
     FROM customer_journey cj
     JOIN campaigns c ON c.id = cj.campaign_id
     WHERE c.id_user = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findUserByEmailExceptId(email, userId) {
  const { rows } = await db.query(
    `SELECT id
     FROM users
     WHERE email = $1 AND id <> $2
     LIMIT 1`,
    [email, userId]
  );
  return rows[0] || null;
}

export async function updateProfile(userId, { fullName, email, phone, avatarUrl }) {
  const { rows } = await db.query(
    `UPDATE users SET
      full_name = COALESCE($1, full_name),
      email = COALESCE($2, email),
      phone = COALESCE($3, phone),
      avatar_url = COALESCE($4, avatar_url),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING id, username, email, full_name, avatar_url, phone`,
    [fullName, email, phone, avatarUrl, userId]
  );
  return rows[0] || null;
}

/**
 * Owner-only daily bot reply cap. Pass null to clear (system limits only).
 * @param {number} userId
 * @param {number|null} cap
 */
export async function updateBotDailyReplyCap(userId, cap) {
  const { rows } = await db.query(
    `UPDATE users
     SET bot_daily_reply_cap = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, bot_daily_reply_cap`,
    [userId, cap]
  );
  return rows[0] || null;
}

/**
 * Owner-only: minutes until AI auto-resumes after handoff. null = off.
 * @param {number} userId
 * @param {number|null} minutes
 */
export async function updateAiHandoffAutoResumeMinutes(userId, minutes) {
  const { rows } = await db.query(
    `UPDATE users
     SET ai_handoff_auto_resume_minutes = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, ai_handoff_auto_resume_minutes`,
    [userId, minutes]
  );
  return rows[0] || null;
}

export async function findRoleAndLimits(userId) {
  const { rows } = await db.query(
    `SELECT r.role_code, r.role_name, ${PROFILE_LIMIT_COLUMNS},
            u.status, u.created_at, u.last_login_at
     FROM users u
     LEFT JOIN roles r ON u.id_role = r.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findRoleAndLimitsFallback(userId) {
  const { rows } = await db.query(
    `SELECT u.role AS role_code, u.role AS role_name,
            NULL::int AS max_campaigns,
            NULL::int AS max_zalo_accounts,
            NULL::int AS max_email_accounts,
            NULL::int AS max_email_templates,
            NULL::int AS max_zalo_templates,
            NULL::int AS max_landing_pages,
            u.status, u.created_at, u.last_login_at
     FROM users u
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function findPasswordHashByUserId(userId) {
  const { rows } = await db.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );
  return rows[0] || null;
}

export async function updatePasswordHash(userId, passwordHash) {
  // Đổi mật khẩu thành công thì gỡ luôn cờ bắt buộc đổi — nếu không, nhân viên
  // vừa được reset sẽ đổi xong vẫn bị requirePasswordChange chặn, kẹt vòng lặp.
  await db.query(
    `UPDATE users
     SET password_hash = $1, must_change_password = FALSE, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [passwordHash, userId]
  );
}

/**
 * Thu hồi mọi refresh token còn hiệu lực của user (đổi/reset mật khẩu).
 * @param {number|string} userId
 * @param {string} [reason='password_changed']
 */
export async function revokeAllRefreshTokensForUser(userId, reason = 'password_changed') {
  await db.query(
    `UPDATE refresh_tokens
     SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = $2
     WHERE id_user = $1 AND is_revoked = FALSE`,
    [userId, reason]
  );
}

/**
 * Xoá refresh token đã hết hạn quá `retentionDays` ngày.
 *
 * Chỉ dựa vào `expires_at` — token bị thu hồi vẫn giữ hạn gốc nên cũng bị dọn
 * theo, không cần điều kiện riêng cho `is_revoked`. Giữ lại một khoảng sau khi
 * hết hạn để còn truy được lịch sử phiên khi điều tra sự cố đăng nhập.
 *
 * Xoá theo lô để một lần chạy đầu tiên trên bảng lớn không khoá bảng quá lâu;
 * job chạy hằng đêm nên phần dư sẽ được dọn nốt ở các lần sau.
 *
 * @param {number} [retentionDays]
 * @param {number} [batchSize]
 * @returns {Promise<number>} số dòng đã xoá
 */
export async function deleteExpiredRefreshTokens(retentionDays = 30, batchSize = 5000) {
  const days = Number.isFinite(Number(retentionDays)) && Number(retentionDays) > 0
    ? Math.floor(Number(retentionDays))
    : 30;
  const limit = Number.isFinite(Number(batchSize)) && Number(batchSize) > 0
    ? Math.floor(Number(batchSize))
    : 5000;

  const { rowCount } = await db.query(
    `DELETE FROM refresh_tokens
     WHERE id IN (
       SELECT id FROM refresh_tokens
       WHERE expires_at < NOW() - ($1 || ' days')::INTERVAL
       LIMIT $2
     )`,
    [String(days), limit]
  );
  return rowCount || 0;
}

export async function findLegacyEmployees({ includeLimits = true } = {}) {
  const limitSelect = includeLimits
    ? 'u.max_campaigns, u.max_zalo_accounts, u.max_email_accounts, u.max_email_templates, u.max_zalo_templates, u.max_landing_pages,'
    : '';
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.status,
            ${limitSelect}
            u.created_at, u.last_login_at, r.role_code, r.role_name
     FROM users u
     JOIN roles r ON u.id_role = r.id
     WHERE r.role_code = 'employee'
     ORDER BY u.created_at DESC, u.id DESC`
  );
  return rows;
}

export async function updateLegacyEmployeeStatus(employeeId, status) {
  const { rows } = await db.query(
    `UPDATE users u
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     FROM roles r
     WHERE u.id = $2
       AND u.id_role = r.id
       AND r.role_code = 'employee'
     RETURNING u.id, u.status`,
    [status, employeeId]
  );
  return rows[0] || null;
}

export async function resetLegacyEmployeePassword(employeeId, passwordHash) {
  const { rows } = await db.query(
    // must_change_password = TRUE: mật khẩu tạm chỉ dùng để đăng nhập một lần.
    `UPDATE users u
     SET password_hash = $1, must_change_password = TRUE, updated_at = CURRENT_TIMESTAMP
     FROM roles r
     WHERE u.id = $2
       AND u.id_role = r.id
       AND r.role_code = 'employee'
     RETURNING u.id`,
    [passwordHash, employeeId]
  );
  return rows[0] || null;
}

export async function updateLegacyEmployeeLimits(employeeId, entries) {
  const setClauses = entries.map((item, index) => `${item.dbColumn} = $${index + 1}`);
  const values = entries.map((item) => item.value);
  values.push(employeeId);

  const { rows } = await db.query(
    `UPDATE users u
     SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
     FROM roles r
     WHERE u.id = $${values.length}
       AND u.id_role = r.id
       AND r.role_code = 'employee'
     RETURNING
       u.id,
       u.max_campaigns,
       u.max_zalo_accounts,
       u.max_email_accounts,
       u.max_email_templates,
       u.max_zalo_templates,
       u.max_landing_pages`,
    values
  );
  return rows[0] || null;
}

export async function findSuccessfulOrdersForUser({ userId, userEmail }) {
  const { rows } = await db.query(
    `SELECT o.id, o.order_code, o.amount, o.status, o.created_at, o.updated_at,
            p.id AS plan_id, p.name AS plan_name, p.code AS plan_code,
            p.daily_email_limit, p.monthly_email_limit,
            p.daily_zalo_limit, p.monthly_zalo_limit,
            o.note, o.topup_config,
            e.status AS einvoice_status, e.so_hdon, e.khhdon,
            e.issued_at AS einvoice_issued_at, e.email_status AS einvoice_email_status
     FROM orders o
     LEFT JOIN plans p ON o.plan_id = p.id
     LEFT JOIN einvoices e ON e.order_id = o.id
     WHERE (o.user_id = $1 OR o.user_email = $2) AND o.status = 'success'
     ORDER BY o.created_at DESC
     LIMIT 20`,
    [userId, userEmail]
  );
  return rows;
}

export async function findInvoiceProfileByUserId(userId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT invoice_profile FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.invoice_profile || null;
}

export async function saveInvoiceProfile(userId, profile, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE users
     SET invoice_profile = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING invoice_profile`,
    [userId, profile ? JSON.stringify(profile) : null]
  );
  return rows[0]?.invoice_profile || null;
}

export async function clearInvoiceProfile(userId, queryable = db) {
  const { rows } = await queryable.query(
    `UPDATE users
     SET invoice_profile = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING invoice_profile`,
    [userId]
  );
  return rows[0]?.invoice_profile || null;
}

export async function findActiveUserByEmail(email) {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE email = $1 AND status = 'active'`,
    [email]
  );
  return rows[0] || null;
}

export async function updatePasswordByEmail(passwordHash, email) {
  const { rows } = await db.query(
    `UPDATE users SET password_hash = $1, auth_provider = 'local', updated_at = CURRENT_TIMESTAMP
     WHERE email = $2 AND status = 'active'
     RETURNING id`,
    [passwordHash, email]
  );
  return rows[0] || null;
}

export async function activateUserByEmail(passwordHash, email) {
  const { rows } = await db.query(
    `UPDATE users
     SET password_hash = $1, status = 'active', updated_at = CURRENT_TIMESTAMP
     WHERE email = $2 AND status = 'pending_activation'
     RETURNING id, username, email, full_name, avatar_url, status, role, active_plan_id,
               NULL AS subscription_expires_at`,
    [passwordHash, email]
  );
  return rows[0] || null;
}

export async function findMembershipsByEmployeeId(employeeId) {
  const { rows } = await db.query(
    `SELECT um.owner_id AS "ownerId",
            u.full_name AS "ownerName",
            u.username AS "ownerUsername",
            u.avatar_url AS "ownerAvatarUrl",
            um.permissions,
            um.status,
            um.daily_email_limit AS "dailyEmailLimit",
            um.monthly_email_limit AS "monthlyEmailLimit",
            um.daily_zalo_limit AS "dailyZaloLimit",
            um.monthly_zalo_limit AS "monthlyZaloLimit",
            (EXISTS (
              SELECT 1 FROM topup_locked_resources tlr
              WHERE tlr.user_id = um.owner_id
                AND tlr.resource_key = 'employees'
                AND tlr.resource_id = um.id
            )) AS "isLocked"
     FROM user_members um
     JOIN users u ON u.id = um.owner_id
     WHERE um.employee_id = $1 AND um.status = 'active'
     ORDER BY um.created_at ASC`,
    [employeeId]
  );
  return rows;
}

export async function insertRefreshToken({ userId, tokenHash, deviceInfo, ipAddress, expiresAt }) {
  await db.query(
    `INSERT INTO refresh_tokens (id_user, token_hash, device_info, ip_address, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
    [userId, tokenHash, deviceInfo, ipAddress, expiresAt]
  );
}
