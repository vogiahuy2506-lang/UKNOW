import db from '../../config/database.js';

const EMPLOYEE_SELECT = `
  u.id, u.username, u.email, u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status,
  um.permissions, um.status AS "memberStatus", um.created_at AS "joinedAt",
  um.daily_email_limit AS "dailyEmailLimit", um.monthly_email_limit AS "monthlyEmailLimit",
  um.daily_zalo_limit AS "dailyZaloLimit",  um.monthly_zalo_limit AS "monthlyZaloLimit",
  um.daily_ai_credit_limit AS "dailyAiCreditLimit", um.period_ai_credit_limit AS "periodAiCreditLimit"
`;

export async function findEmployeesByOwner(ownerId) {
  const result = await db.query(
    `SELECT ${EMPLOYEE_SELECT}
     FROM user_members um
     JOIN users u ON um.employee_id = u.id
     WHERE um.owner_id = $1
     ORDER BY um.created_at DESC`,
    [ownerId]
  );
  return result.rows;
}

export async function findEmployeeByIdAndOwner(employeeId, ownerId) {
  const result = await db.query(
    `SELECT ${EMPLOYEE_SELECT}
     FROM user_members um
     JOIN users u ON um.employee_id = u.id
     WHERE um.employee_id = $1 AND um.owner_id = $2`,
    [employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function countActiveEmployees(ownerId) {
  const result = await db.query(
    `SELECT COUNT(*) AS count FROM user_members
     WHERE owner_id = $1 AND status = 'active'`,
    [ownerId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function findOwnerPlanLimit(ownerId) {
  const result = await db.query(
    `SELECT p.max_employees
     FROM users u
     JOIN plans p ON u.active_plan_id = p.id
     WHERE u.id = $1`,
    [ownerId]
  );
  return result.rows[0]?.max_employees ?? null;
}

export async function findUserByEmail(email) {
  const result = await db.query(
    `SELECT id, username, email, full_name AS "fullName", role, active_plan_id AS "activePlanId"
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return result.rows[0] || null;
}

export async function findOwnerInfo(ownerId) {
  const result = await db.query(
    `SELECT id, username, full_name AS "fullName" FROM users WHERE id = $1`,
    [ownerId]
  );
  return result.rows[0] || null;
}

export async function createEmployeeWithLink({ ownerId, username, email, passwordHash, fullName }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Tạo user mới với role user_admin (pending_activation cho đến khi họ set password)
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, status, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending_activation', 'user', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, username, email, full_name, avatar_url, status, role`,
      [username, email, passwordHash, fullName || null]
    );
    const newUser = userResult.rows[0];

    const memberResult = await client.query(
      `INSERT INTO user_members (owner_id, employee_id)
       VALUES ($1, $2)
       RETURNING permissions, status AS "memberStatus", created_at AS "joinedAt",
                 daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit",
                 daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit"`,
      [ownerId, newUser.id]
    );

    await client.query('COMMIT');
    return { ...newUser, ...memberResult.rows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function linkExistingUserAsEmployee(ownerId, userId) {
  // Không cần transaction hay UPDATE role — chỉ tạo quan hệ user_members
  const result = await db.query(
    `INSERT INTO user_members (owner_id, employee_id)
     VALUES ($1, $2)
     ON CONFLICT (owner_id, employee_id) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
     RETURNING permissions, status AS "memberStatus", created_at AS "joinedAt",
               daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit",
               daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit"`,
    [ownerId, userId]
  );
  return result.rows[0];
}

export async function updateEmployeeInfo(employeeId, ownerId, { fullName, email }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Kiểm tra employee thuộc owner
    const check = await client.query(
      `SELECT 1 FROM user_members WHERE employee_id = $1 AND owner_id = $2`,
      [employeeId, ownerId]
    );
    if (!check.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const result = await client.query(
      `UPDATE users
       SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING id, username, email, full_name AS "fullName"`,
      [fullName || null, email, employeeId]
    );

    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateEmployeePermissions(employeeId, ownerId, permissions) {
  const result = await db.query(
    `UPDATE user_members
     SET permissions = $1, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $2 AND owner_id = $3
     RETURNING permissions`,
    [JSON.stringify(permissions), employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function updateEmployeeStatus(employeeId, ownerId, status) {
  const result = await db.query(
    `UPDATE user_members
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $2 AND owner_id = $3
     RETURNING status AS "memberStatus"`,
    [status, employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function updateEmployeeSendLimits(employeeId, ownerId, {
  dailyEmailLimit,
  monthlyEmailLimit,
  dailyZaloLimit,
  monthlyZaloLimit,
  dailyAiCreditLimit = null,
  periodAiCreditLimit = null,
}) {
  const result = await db.query(
    `UPDATE user_members
     SET daily_email_limit     = $1,
         monthly_email_limit   = $2,
         daily_zalo_limit      = $3,
         monthly_zalo_limit    = $4,
         daily_ai_credit_limit = $5,
         period_ai_credit_limit = $6,
         updated_at            = CURRENT_TIMESTAMP
     WHERE employee_id = $7 AND owner_id = $8
     RETURNING daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit",
               daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit",
               daily_ai_credit_limit AS "dailyAiCreditLimit", period_ai_credit_limit AS "periodAiCreditLimit"`,
    [dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit, dailyAiCreditLimit, periodAiCreditLimit, employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function findOwnerIdForEmployee(employeeId) {
  const { rows } = await db.query(
    `SELECT owner_id AS "ownerId"
     FROM user_members
     WHERE employee_id = $1
       AND status = 'active'
     ORDER BY updated_at DESC NULLS LAST, created_at DESC, owner_id ASC
     LIMIT 1`,
    [employeeId]
  );
  return rows[0]?.ownerId ? Number(rows[0].ownerId) : null;
}

export async function findTeamOverview(ownerId, { employeeId = null } = {}) {
  const params = [ownerId];
  let employeeFilter = '';
  if (employeeId != null) {
    params.push(employeeId);
    employeeFilter = ` AND um.employee_id = $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT
       u.id,
       u.username,
       u.full_name            AS "fullName",
       u.avatar_url           AS "avatarUrl",
       u.status,
       um.status              AS "memberStatus",
       um.daily_email_limit   AS "dailyEmailLimit",
       um.monthly_email_limit AS "monthlyEmailLimit",
       um.daily_zalo_limit    AS "dailyZaloLimit",
       um.monthly_zalo_limit  AS "monthlyZaloLimit",

       COUNT(DISTINCT c.id) FILTER (
         WHERE c.status::text IN ('running', 'active', 'processing')
       )::int                                                        AS "runningCampaigns",

       COUNT(DISTINCT c.id) FILTER (
         WHERE c.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
       )::int                                                        AS "campaignsThisMonth",

       COALESCE(SUM(cr.successful_sends) FILTER (
         WHERE cr.started_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
       ), 0)::int                                                    AS "sendsThisMonth",

       COALESCE(SUM(cr.failed_sends) FILTER (
         WHERE cr.started_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
       ), 0)::int                                                    AS "failedThisMonth",

       MAX(cr.started_at)                                            AS "lastActiveAt",

       (
         SELECT COUNT(*)::int
         FROM audit_logs al
         WHERE al.id_user = u.id
           AND al.owner_id = $1
           AND al.action IN ('EMAIL_TEMPLATE_CREATED', 'ZALO_TEMPLATE_CREATED')
           AND al.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
       )                                                             AS "templatesThisMonth",

       (
         SELECT COALESCE(SUM(ABS(ul.delta)), 0)::int
         FROM usage_logs ul
         WHERE ul.actor_user_id = u.id
           AND ul.resource_type = 'ai_credit'
           AND ul.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
       )                                                             AS "aiCreditsThisMonth"

     FROM user_members um
     JOIN users u ON u.id = um.employee_id
     LEFT JOIN campaigns c ON c.id_user = um.employee_id
     LEFT JOIN campaign_runs cr ON cr.id_campaign = c.id
     WHERE um.owner_id = $1${employeeFilter}
     GROUP BY u.id, u.username, u.full_name, u.avatar_url, u.status,
              um.status, um.daily_email_limit, um.monthly_email_limit,
              um.daily_zalo_limit, um.monthly_zalo_limit
     ORDER BY u.username`,
    params
  );

  return rows.map((row) => {
    const sends = Number(row.sendsThisMonth || 0);
    const failed = Number(row.failedThisMonth || 0);
    const denom = sends + failed;
    return {
      ...row,
      successRate: denom > 0 ? Math.round((sends / denom) * 1000) / 10 : null,
      attributionNote: 'Theo người tạo chiến dịch (chưa đủ dữ liệu triggered_by)',
    };
  });
}

export async function removeEmployee(employeeId, ownerId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM user_members WHERE employee_id = $1 AND owner_id = $2`,
      [employeeId, ownerId]
    );

    const userRes = await client.query(
      `SELECT status FROM users WHERE id = $1`,
      [employeeId]
    );
    const userStatus = userRes.rows[0]?.status;

    if (userStatus === 'pending_activation') {
      // Được mời nhưng chưa kích hoạt → xóa hẳn để email có thể dùng lại
      await client.query(`DELETE FROM users WHERE id = $1`, [employeeId]);
    }
    // Tài khoản đã active: giữ nguyên user_admin, không cần đổi role

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function resetEmployeePassword(employeeId, ownerId, passwordHash) {
  const result = await db.query(
    // must_change_password = TRUE: mật khẩu tạm chỉ để đăng nhập một lần, middleware
    // requirePasswordChange sẽ chặn mọi thao tác cho tới khi nhân viên tự đổi.
    `UPDATE users SET password_hash = $1, must_change_password = TRUE,
                     updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND EXISTS (
       SELECT 1 FROM user_members WHERE employee_id = $2 AND owner_id = $3
     )
     RETURNING id`,
    [passwordHash, employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function findCampaignApprovalThreshold(ownerId) {
  const result = await db.query(
    `SELECT employee_campaign_approval_threshold
     FROM users
     WHERE id = $1`,
    [ownerId]
  );
  const val = result.rows[0]?.employee_campaign_approval_threshold;
  return val != null ? Number(val) : null;
}

export async function updateCampaignApprovalThreshold(ownerId, threshold) {
  const result = await db.query(
    `UPDATE users
     SET employee_campaign_approval_threshold = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING employee_campaign_approval_threshold`,
    [threshold, ownerId]
  );
  const val = result.rows[0]?.employee_campaign_approval_threshold;
  return val != null ? Number(val) : null;
}
