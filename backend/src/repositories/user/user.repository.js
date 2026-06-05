import db from '../../config/database.js';

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
  p.max_employees AS plan_max_employees,
  p.daily_email_limit,
  p.monthly_email_limit,
  p.daily_zalo_limit,
  p.monthly_zalo_limit
`;

export async function findProfileBase(userId) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name, u.avatar_url, u.phone, u.status,
            u.role, u.active_plan_id, u.subscription_expires_at,
            ${PROFILE_LIMIT_COLUMNS},
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
     WHERE p.id = COALESCE(
       $1::int,
       (SELECT o.plan_id FROM orders o
        WHERE o.user_id = $2 OR o.user_email = $3
        ORDER BY o.created_at DESC LIMIT 1)
     )`,
    [activePlanId || null, userId, email]
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
     JOIN campaigns c ON cj.campaign_id = c.id
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
  await db.query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [passwordHash, userId]
  );
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

export async function createLegacyEmployee({ username, email, passwordHash, fullName, phone }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const existingUserResult = await client.query(
      `SELECT id
       FROM users
       WHERE username = $1 OR email = $2
       LIMIT 1`,
      [username, email]
    );
    if (existingUserResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return { status: 'duplicate' };
    }

    const employeeRoleResult = await client.query(
      `SELECT id
       FROM roles
       WHERE role_code = 'employee'
       LIMIT 1`
    );
    if (employeeRoleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { status: 'missing_role' };
    }

    const createResult = await client.query(
      `INSERT INTO users (
        username, email, password_hash, full_name, phone, status, id_role, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, username, email, full_name, phone, status, created_at`,
      [
        username,
        email,
        passwordHash,
        fullName || null,
        phone || null,
        employeeRoleResult.rows[0].id,
      ]
    );

    await client.query('COMMIT');
    return { status: 'created', employee: createResult.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
    `UPDATE users u
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
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
            p.daily_zalo_limit, p.monthly_zalo_limit
     FROM orders o
     LEFT JOIN plans p ON o.plan_id = p.id
     WHERE (o.user_id = $1 OR o.user_email = $2) AND o.status = 'success'
     ORDER BY o.created_at DESC
     LIMIT 20`,
    [userId, userEmail]
  );
  return rows;
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
    `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
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
            um.monthly_zalo_limit AS "monthlyZaloLimit"
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
