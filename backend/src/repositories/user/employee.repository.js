import db from '../../config/database.js';
import { generateReferralCode } from '../../utils/affiliateReferral.util.js';
import { buildDefaultNewEmployeePermissions } from '../../config/employeePermissionCatalog.js';

const EMPLOYEE_SELECT = `
  u.id, u.username, u.email, u.full_name AS "fullName", u.avatar_url AS "avatarUrl", u.status,
  um.permissions, um.status AS "memberStatus", um.created_at AS "joinedAt",
  um.daily_email_limit AS "dailyEmailLimit", um.monthly_email_limit AS "monthlyEmailLimit",
  um.daily_zalo_limit AS "dailyZaloLimit",  um.monthly_zalo_limit AS "monthlyZaloLimit",
  um.daily_ai_credit_limit AS "dailyAiCreditLimit", um.period_ai_credit_limit AS "periodAiCreditLimit",
  um.origin, um.accepted_at AS "acceptedAt"
`;

export async function findEmployeesByOwner(ownerId) {
  const result = await db.query(
    // Tài khoản đã xoá mềm (status = 'deleted') không hiện trong danh sách: dòng user_members của họ
    // giờ được gỡ ngay lúc xoá (adminMembers.repository.detachMemberEmail), điều kiện này đỡ cho dòng
    // cũ còn sót — chủ shop thấy một người "…_freed_7" không thao tác được gì là chuyện đã có thật.
    `SELECT ${EMPLOYEE_SELECT}
     FROM user_members um
     JOIN users u ON um.employee_id = u.id
     WHERE um.owner_id = $1 AND u.status <> 'deleted'
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
    // Không đếm nhân viên có tài khoản đã xoá mềm: họ không đăng nhập được nên không dùng suất, mà đếm
    // vào thì chủ shop bị báo "hết suất" oan (production 21/09/2026: user 7 đã xoá chiếm 1/3 suất của tài khoản 1).
    `SELECT COUNT(*) AS count
       FROM user_members um
       JOIN users u ON u.id = um.employee_id
      WHERE um.owner_id = $1 AND um.status = 'active' AND u.status <> 'deleted'`,
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
    `SELECT id, username, email, full_name AS "fullName", role, status, active_plan_id AS "activePlanId"
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return result.rows[0] || null;
}

/**
 * `users.username` là unique TOÀN HỆ THỐNG (không theo workspace) và phân biệt hoa/thường ở
 * mức ràng buộc, nên so LOWER để "Abc" và "abc" cũng bị coi là trùng — người dùng đăng nhập
 * không thể phân biệt hai tên đó.
 */
export async function findUserByUsername(username) {
  const result = await db.query(
    `SELECT id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [username]
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

    // Sinh mã giới thiệu duy nhất cho nhân viên mới (Affiliate PR-A1)
    let referralCode = generateReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existingCode = await client.query('SELECT 1 FROM users WHERE referral_code = $1', [referralCode]);
      if (existingCode.rows.length === 0) break;
      referralCode = generateReferralCode();
    }

    // Tạo user mới với role user_admin (pending_activation cho đến khi họ set password)
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, status, role, referral_code, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pending_activation', 'user', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, username, email, full_name, avatar_url, status, role, referral_code`,
      [username, email, passwordHash, fullName || null, referralCode]
    );
    const newUser = userResult.rows[0];

    // Truyền quyền mặc định tường minh: mặc định của cột lệch nhau giữa các môi trường
    // (migration 001 `{campaigns_view:true,…}`, schema.sql `'{}'`, production `'[]'`) nên
    // để DB tự điền là để kết quả phụ thuộc máy chạy.
    // origin = 'created': tài khoản này do chủ tạo ra → chủ được đặt lại mật khẩu / sửa email / xoá khi chưa
    // kích hoạt. Membership từ linkExistingUserAsEmployee là 'linked' và KHÔNG có ba quyền đó (migration 256).
    // accepted_at = NOW(): chủ tạo tài khoản này từ đầu → coi là đồng ý ngầm ngay lúc tạo (migration 257).
    const memberResult = await client.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, origin, accepted_at)
       VALUES ($1, $2, $3::jsonb, 'created', NOW())
       RETURNING permissions, status AS "memberStatus", created_at AS "joinedAt", origin,
                 accepted_at AS "acceptedAt",
                 daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit",
                 daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit"`,
      [ownerId, newUser.id, JSON.stringify(buildDefaultNewEmployeePermissions())]
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
  // Không cần transaction hay UPDATE role — chỉ tạo quan hệ user_members.
  // Quyền mặc định chỉ áp cho hàng MỚI: nhánh ON CONFLICT là người từng ở trong team
  // (gỡ khỏi team là DELETE hàng, nên tới đây chỉ còn ca membership đang bị khoá) —
  // link lại không được ghi đè bộ quyền chủ đã chỉnh.
  // origin = 'linked': tài khoản có sẵn, không phải của chủ → chủ không được đặt lại mật khẩu / sửa email.
  // accepted_at = NULL: đây là chỗ DUY NHẤT trong code cố ý ghi đè default NOW() của cột (migration 257)
  // — liên kết tài khoản có sẵn thì người đó chưa đồng ý gì, resolveUserContext chặn switch context tới
  // khi họ tự bấm Chấp nhận (POST /users/me/memberships/:ownerId/accept).
  // ON CONFLICT giữ nguyên origin/accepted_at cũ (người từng được chủ tạo/đã từng chấp nhận rồi bị gỡ
  // rồi link lại không bị bắt đồng ý lại từ đầu).
  const result = await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, origin, accepted_at)
     VALUES ($1, $2, $3::jsonb, 'linked', NULL)
     ON CONFLICT (owner_id, employee_id) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP
     RETURNING employee_id AS "id", permissions, status AS "memberStatus", created_at AS "joinedAt", origin,
               accepted_at AS "acceptedAt",
               daily_email_limit AS "dailyEmailLimit", monthly_email_limit AS "monthlyEmailLimit",
               daily_zalo_limit AS "dailyZaloLimit", monthly_zalo_limit AS "monthlyZaloLimit"`,
    [ownerId, userId, JSON.stringify(buildDefaultNewEmployeePermissions())]
  );
  return result.rows[0];
}

/**
 * Người bị liên kết tự bấm "Chấp nhận" lời mời — chỉ trúng dòng đang thật sự chờ
 * (accepted_at IS NULL), để bấm hai lần hay bấm nhầm dòng đã chấp nhận đều là no-op an toàn.
 */
export async function acceptMembership(employeeId, ownerId) {
  const result = await db.query(
    `UPDATE user_members
     SET accepted_at = NOW(), updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $1 AND owner_id = $2 AND accepted_at IS NULL
     RETURNING owner_id AS "ownerId", employee_id AS "employeeId", accepted_at AS "acceptedAt"`,
    [employeeId, ownerId]
  );
  return result.rows[0] || null;
}

/**
 * Người bị liên kết từ chối lời mời — xoá hẳn dòng, chỉ khi vẫn đang chờ (accepted_at IS NULL) để
 * không lỡ xoá một membership đã chấp nhận từ trước (dòng đó phải qua "Xoá khỏi nhóm" của chủ).
 */
export async function declineMembership(employeeId, ownerId) {
  const result = await db.query(
    `DELETE FROM user_members
     WHERE employee_id = $1 AND owner_id = $2 AND accepted_at IS NULL
     RETURNING owner_id AS "ownerId", employee_id AS "employeeId"`,
    [employeeId, ownerId]
  );
  return result.rows[0] || null;
}

export async function updateEmployeeInfo(employeeId, ownerId, { fullName, email }) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Kiểm tra employee thuộc owner VÀ là tài khoản do chủ tạo (origin = 'created'). Tài khoản có sẵn bị
    // liên kết thì đây là hồ sơ của người khác — service đã chặn 403 trước, dòng này là lớp đỡ thứ hai.
    const check = await client.query(
      `SELECT 1 FROM user_members WHERE employee_id = $1 AND owner_id = $2 AND origin = 'created'`,
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

export async function removeEmployee(employeeId, ownerId) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const memberRes = await client.query(
      `DELETE FROM user_members WHERE employee_id = $1 AND owner_id = $2 RETURNING origin`,
      [employeeId, ownerId]
    );
    const origin = memberRes.rows[0]?.origin;

    const userRes = await client.query(
      `SELECT status FROM users WHERE id = $1`,
      [employeeId]
    );
    const userStatus = userRes.rows[0]?.status;

    if (userStatus === 'pending_activation' && origin === 'created') {
      // Do chính chủ này mời và chưa kích hoạt → xóa hẳn để email có thể dùng lại.
      // origin = 'linked' mà vẫn pending: tài khoản do CHỦ KHÁC mời (hoặc tự đăng ký chưa xong) rồi bị
      // chủ này liên kết — xoá users ở đây là xoá tài khoản của người ta, chỉ gỡ membership.
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
    // origin = 'created': chỉ tài khoản do chủ tạo. Tài khoản có sẵn bị liên kết mà reset được là chủ nhóm
    // đăng nhập vào tài khoản người khác (RA_SOAT_NHAN_VIEN_PHAN_QUYEN_2026-09-28 mục 1).
    `UPDATE users SET password_hash = $1, must_change_password = TRUE,
                     updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND EXISTS (
       SELECT 1 FROM user_members WHERE employee_id = $2 AND owner_id = $3 AND origin = 'created'
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
