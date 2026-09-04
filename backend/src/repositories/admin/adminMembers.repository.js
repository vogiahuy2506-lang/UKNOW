import db from '../../config/database.js';

/**
 * Danh sách tất cả user_admin, kèm thông tin gói và số nhân viên.
 * Hỗ trợ tìm kiếm theo tên/email và lọc theo plan/status.
 */
export async function findAllMembers({ search, planId, status, expiry, role } = {}) {
  // Default to role='user' for member listing, allow override
  const roleCondition = role ? `u.role = '${role}'` : "u.role = 'user'";
  const conditions = [roleCondition];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  if (planId === 'none') {
    conditions.push(`u.active_plan_id IS NULL`);
  } else if (planId === 'custom') {
    // Lọc user đang dùng gói riêng (enterprise)
    conditions.push(`EXISTS (SELECT 1 FROM plans p WHERE p.id = u.active_plan_id AND p.is_custom = TRUE)`);
  } else if (planId) {
    params.push(planId);
    conditions.push(`u.active_plan_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`u.status = $${params.length}`);
  }
  if (expiry === 'expiring') {
    conditions.push(`u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > NOW() AND u.subscription_expires_at <= NOW() + INTERVAL '7 days'`);
  } else if (expiry === 'expired') {
    conditions.push(`u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at < NOW() AND u.active_plan_id IS NULL`);
  }

  const where = conditions.join(' AND ');

  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT
         u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.created_at AS "createdAt",
         u.active_plan_id AS "activePlanId", u.subscription_expires_at AS "subscriptionExpiresAt",
         u.last_login_at AS "lastLoginAt",
         p.name AS "planName",
         p.code AS "planCode",
         (SELECT COUNT(*) FROM user_members um WHERE um.owner_id = u.id) AS "employeeCount",
         (
           SELECT COALESCE(SUM(cr.failed_sends), 0)::int
           FROM campaigns c
           JOIN campaign_runs cr ON cr.id_campaign = c.id
           WHERE c.id_user = u.id
             AND cr.started_at >= NOW() - INTERVAL '30 days'
         ) AS "failedSends30d",
         (
           SELECT COALESCE(SUM(ABS(delta)), 0)::int
           FROM usage_logs ul
           WHERE ul.id_user = u.id
             AND ul.resource_type = 'ai_credit'
             AND ul.created_at >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
         ) AS "aiCreditsUsedThisMonth",
         COALESCE(p.ai_credits_per_period, 0)::int AS "aiCreditsLimit",
         CASE
           WHEN u.last_login_at IS NULL THEN TRUE
           WHEN u.last_login_at < NOW() - INTERVAL '21 days' THEN TRUE
           WHEN u.subscription_expires_at IS NOT NULL
             AND u.subscription_expires_at <= NOW() + INTERVAL '7 days'
             AND u.subscription_expires_at > NOW() THEN TRUE
           ELSE FALSE
         END AS "churnRisk"
       FROM users u
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ${where}
       ORDER BY u.subscription_expires_at ASC NULLS LAST, u.created_at DESC`,
      params
    ));
  } catch {
    // Fallback khi migration 007 chưa chạy (cột subscription_expires_at chưa có)
    ({ rows } = await db.query(
      `SELECT
         u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.created_at AS "createdAt",
         u.active_plan_id AS "activePlanId", NULL AS "subscriptionExpiresAt",
         p.name AS "planName",
         p.code AS "planCode",
         (SELECT COUNT(*) FROM user_members um WHERE um.owner_id = u.id) AS "employeeCount"
       FROM users u
       LEFT JOIN plans p ON p.id = u.active_plan_id
       WHERE ${where}
       ORDER BY u.created_at DESC`,
      params
    ));
  }
  return rows;
}

export async function findMemberById(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.role, u.created_at AS "createdAt", 
            u.active_plan_id AS "activePlanId",
            p.name AS "planName", p.code AS "planCode"
     FROM users u
     LEFT JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function setMemberStatus(id, status) {
  const { rows } = await db.query(
    `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 AND role = 'user'
     RETURNING id, status`,
    [status, id]
  );
  return rows[0] || null;
}

export async function promoteMemberToSuperAdmin(id) {
  const { rows } = await db.query(
    `UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = $1 AND role = 'user'
     RETURNING id, username, email, role`,
    [id]
  );
  return rows[0] || null;
}

export async function demoteMemberFromSuperAdmin(id) {
  const { rows } = await db.query(
    `UPDATE users SET role = 'user', updated_at = NOW() WHERE id = $1 AND role = 'admin'
     RETURNING id, username, email, role`,
    [id]
  );
  return rows[0] || null;
}

export async function countAdmins() {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin'`
  );
  return rows[0]?.total ?? 0;
}

export async function setMemberRole(id, role) {
  const { rows } = await db.query(
    `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND role IN ('user', 'admin')
     RETURNING id, username, email, role`,
    [role, id]
  );
  return rows[0] || null;
}

/**
 * Giải phóng email/username của user (Mức 1 — "gỡ email khỏi tài khoản"), giữ
 * nguyên mọi dữ liệu liên quan (đơn hàng, hoá đơn...). Sau thao tác này, email gốc
 * đăng ký lại được như tài khoản hoàn toàn mới.
 *
 * username có UNIQUE + VARCHAR(50) — cắt phần username gốc nếu cần để hậu tố
 * "_freed_<id>" không tràn quá 50 ký tự.
 *
 * Nếu releaseTrialHistory = true:
 *   Ẩn danh user_email của các đơn dùng thử/miễn phí (code = trial hoặc price = 0)
 *   sang freed+<id>@deleted.local trong cùng transaction.
 *   Tuyệt đối KHÔNG DELETE đơn, và KHÔNG đụng đến đơn trả tiền.
 */
export async function detachMemberEmail(id, { originalEmail = null, releaseTrialHistory = false, trialPlanCode = process.env.SIGNUP_TRIAL_PLAN_CODE || 'trial' } = {}) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      // `phone` phải được giải phóng cùng email/username — nó là trường định danh DUY NHẤT
      // thứ ba kể từ migration 179 (idx_users_phone_unique). Hàm này viết khi mới có 2
      // trường, và migration 179 không rà lại đường giải phóng định danh.
      //
      // Hậu quả có thật: tài khoản id=7 bị xoá mềm vẫn giữ 0388180856, nên chính chủ không
      // đăng ký/nhập lại số của mình được nữa — user `deleted` không đăng nhập nổi
      // (resolveUserContext chỉ nhận active/pending_activation) nên số bị giam vĩnh viễn.
      //
      // Thêm trường UNIQUE mới vào `users` thì phải quay lại thêm vào đây.
      `UPDATE users
         SET email = 'freed+' || id || '@deleted.local',
             username = LEFT(username, 50 - LENGTH('_freed_' || id)) || '_freed_' || id,
             phone = NULL,
             status = 'deleted',
             updated_at = NOW()
       WHERE id = $1 AND status != 'deleted'
       RETURNING id, email, username, status`,
      [id]
    );
    const updatedUser = rows[0] || null;
    if (!updatedUser) {
      await client.query('ROLLBACK');
      return null;
    }

    let anonymizedTrialOrdersCount = 0;
    if (releaseTrialHistory) {
      const orderUpdateRes = await client.query(
        `UPDATE orders
            SET user_email = 'freed+' || $1 || '@deleted.local',
                updated_at = NOW()
          WHERE (user_id = $1 OR (user_id IS NULL AND $2::text IS NOT NULL AND LOWER(user_email) = LOWER($2)))
            AND plan_id IN (
              SELECT id FROM plans
               WHERE code = COALESCE(NULLIF($3, ''), 'trial') OR price = 0
            )`,
        [id, originalEmail, trialPlanCode]
      );
      anonymizedTrialOrdersCount = orderUpdateRes.rowCount || 0;
    }

    await client.query('COMMIT');
    return {
      ...updatedUser,
      releaseTrialHistory: Boolean(releaseTrialHistory),
      anonymizedTrialOrdersCount,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Kiểm tra user có dữ liệu "sống" chặn xoá cứng (Mức 2) không — đơn hàng thành
 * công, hoặc bất kỳ dòng marketplace nào (mua/bán/review/yêu thích).
 * @returns {Promise<string[]>} danh sách lý do chặn, rỗng = xoá được
 */
export async function findPurgeBlockers(id) {
  const { rows } = await db.query(
    `SELECT
       EXISTS(SELECT 1 FROM orders WHERE user_id = $1 AND status = 'success') AS "hasOrders",
       EXISTS(
         SELECT 1 FROM marketplace_listings WHERE id_user = $1
         UNION ALL
         SELECT 1 FROM marketplace_purchases WHERE id_user = $1 OR seller_id = $1
         UNION ALL
         SELECT 1 FROM marketplace_reviews WHERE id_user = $1
         UNION ALL
         SELECT 1 FROM marketplace_favorites WHERE id_user = $1
       ) AS "hasMarketplace",
       EXISTS(
         SELECT 1 FROM affiliate_revenue_events WHERE referrer_user_id = $1 OR buyer_user_id = $1
         UNION ALL
         SELECT 1 FROM affiliate_periods WHERE referrer_user_id = $1
         UNION ALL
         SELECT 1 FROM affiliate_ledger WHERE user_id = $1
       ) AS "hasAffiliateActivity"`,
    [id]
  );
  const row = rows[0] || {};
  const reasons = [];
  if (row.hasOrders) reasons.push('đơn hàng thành công');
  if (row.hasMarketplace) reasons.push('dữ liệu marketplace (đã đăng bán/mua/đánh giá/yêu thích)');
  if (row.hasAffiliateActivity) reasons.push('hoạt động affiliate (doanh thu giới thiệu hoặc được giới thiệu)');
  return reasons;
}

/** Xoá cứng user (Mức 2). Caller phải tự kiểm findPurgeBlockers trước. */
export async function purgeMember(id) {
  const { rows } = await db.query(
    `DELETE FROM users WHERE id = $1 RETURNING id, email, username`,
    [id]
  );
  return rows[0] || null;
}
