import db from '../../config/database.js';

const EMPLOYEE_SELECT = `
  u.id, u.username, u.email, u.full_name, u.avatar_url, u.status,
  um.permissions, um.status AS member_status, um.created_at AS joined_at,
  um.daily_email_limit, um.monthly_email_limit,
  um.daily_zalo_limit,  um.monthly_zalo_limit
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
    `SELECT id, username, email, full_name, role, active_plan_id
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

export async function createEmployeeWithLink({ ownerId, username, email, passwordHash, fullName }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, status, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 'employee', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, username, email, full_name, avatar_url, status, role`,
      [username, email, passwordHash, fullName || null]
    );
    const newUser = userResult.rows[0];

    const memberResult = await client.query(
      `INSERT INTO user_members (owner_id, employee_id)
       VALUES ($1, $2)
       RETURNING permissions, status, created_at,
                 daily_email_limit, monthly_email_limit,
                 daily_zalo_limit, monthly_zalo_limit`,
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
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET role = 'employee', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId]
    );

    const memberResult = await client.query(
      `INSERT INTO user_members (owner_id, employee_id)
       VALUES ($1, $2)
       RETURNING permissions, status, created_at,
                 daily_email_limit, monthly_email_limit,
                 daily_zalo_limit, monthly_zalo_limit`,
      [ownerId, userId]
    );

    await client.query('COMMIT');
    return memberResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
       RETURNING id, username, email, full_name`,
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
     RETURNING status`,
    [status, employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function updateEmployeeSendLimits(employeeId, ownerId, {
  dailyEmailLimit,
  monthlyEmailLimit,
  dailyZaloLimit,
  monthlyZaloLimit,
}) {
  const result = await db.query(
    `UPDATE user_members
     SET daily_email_limit   = $1,
         monthly_email_limit = $2,
         daily_zalo_limit    = $3,
         monthly_zalo_limit  = $4,
         updated_at          = CURRENT_TIMESTAMP
     WHERE employee_id = $5 AND owner_id = $6
     RETURNING daily_email_limit, monthly_email_limit,
               daily_zalo_limit, monthly_zalo_limit`,
    [dailyEmailLimit, monthlyEmailLimit, dailyZaloLimit, monthlyZaloLimit, employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function removeEmployee(employeeId, ownerId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM user_members WHERE employee_id = $1 AND owner_id = $2`,
      [employeeId, ownerId]
    );

    await client.query(
      `UPDATE users SET role = 'user_admin', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [employeeId]
    );

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
    `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND EXISTS (
       SELECT 1 FROM user_members WHERE employee_id = $2 AND owner_id = $3
     )
     RETURNING id`,
    [passwordHash, employeeId, ownerId]
  );
  return result.rows[0] || null;
}
