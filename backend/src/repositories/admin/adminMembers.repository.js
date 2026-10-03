import db from '../../config/database.js';
import {
  activePlanSql,
  customerSegmentSql,
  expiredWithinSql,
  expiringSql,
  payingSql,
  planStateFilterSql,
  segmentFilterSql,
} from '../../services/admin/customerDefinitions.js';

/**
 * Danh sách thành viên kèm thông tin gói và số nhân viên.
 *
 * MẶC ĐỊNH CHỈ CÓ "KHÁCH" (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9): không nhân viên thuần, không tài khoản nội bộ,
 * không tài khoản đã xoá, không admin — định nghĩa ở customerDefinitions.js. `segment` chọn xem nhóm khác
 * (employee / internal / deleted) hoặc 'all' (mọi nhóm trừ admin); `role: 'admin'` là tab Admin riêng.
 * `planState` (paying / trial / expiring / expired30) là bộ lọc của các thẻ đầu trang: dùng ĐÚNG mảnh SQL đã đếm ở
 * getMembersSummary nên bấm thẻ ra đúng số dòng.
 *
 * Bỏ khỏi bản cũ: cột "% AI" (kỳ dương lịch ≠ kỳ 30 ngày của khách và của cổng chặn — đã có ở trang AI) và "Gửi lỗi
 * 30 ngày" (bộ đếm campaign_runs phình — đã có ở trang Giám sát gửi tin), cùng nhánh dự phòng "migration 007 chưa
 * chạy": nhánh đó nuốt mọi lỗi SQL rồi trả danh sách KHÔNG có bộ lọc nhóm — đúng loại số sai im lặng cần tránh.
 *
 * `lastActivityAt` = mốc muộn hơn giữa lần đăng nhập gần nhất và lần cấp / xoay refresh token gần nhất. users.last_login_at
 * chỉ đổi khi đăng nhập bằng mật khẩu / Google; refresh token xoay khi phiên còn dùng (access token 3 giờ) nên người dùng
 * đều đặn không còn bị gắn "nguy cơ rời bỏ" chỉ vì lâu không gõ lại mật khẩu. Bảng refresh_tokens dọn 30 ngày sau hạn,
 * đủ dài cho ngưỡng 21 ngày.
 */
export async function findAllMembers({ search, planId, status, expiry, role, phoneVerified, segment, planState } = {}) {
  // `role` chỉ có hai giá trị hợp lệ; trước đây được nội suy thẳng vào SQL.
  const isAdminView = role === 'admin';
  const conditions = [isAdminView ? "u.role = 'admin'" : segmentFilterSql(segment, 'u')];
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
  const planStateCondition = planStateFilterSql(planState, 'u');
  if (planStateCondition) conditions.push(planStateCondition);
  if (phoneVerified === 'verified') {
    conditions.push(`u.phone_verified_at IS NOT NULL`);
  } else if (phoneVerified === 'unverified') {
    // Kể cả chưa có số (phone IS NULL) — "chưa xác thực" bao gồm cả chưa nhập.
    conditions.push(`u.phone_verified_at IS NULL`);
  }

  const where = conditions.join(' AND ');

  const { rows } = await db.query(
    `SELECT t.*, (t."churnRiskReason" IS NOT NULL) AS "churnRisk"
       FROM (
         SELECT
           u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.created_at AS "createdAt",
           u.active_plan_id AS "activePlanId", u.subscription_expires_at AS "subscriptionExpiresAt",
           u.last_login_at AS "lastLoginAt",
           la.at AS "lastActivityAt",
           u.phone AS "phone", u.phone_verified_at AS "phoneVerifiedAt",
           (tf.user_id IS NOT NULL) AS "twoFactorEnabled",
           p.name AS "planName",
           p.code AS "planCode",
           ${customerSegmentSql('u')} AS "segment",
           (CASE
              WHEN ${payingSql('u')} THEN 'paying'
              WHEN ${activePlanSql('u')} THEN 'trial'
              WHEN u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at <= NOW() THEN 'expired'
              ELSE 'none'
            END) AS "planState",
           -- Cùng cách đếm với cổng thêm nhân viên (countActiveEmployees): chỉ 'active' và tài khoản chưa xoá.
           (SELECT COUNT(*) FROM user_members um
              JOIN users e ON e.id = um.employee_id
             WHERE um.owner_id = u.id AND um.status = 'active' AND e.status <> 'deleted') AS "employeeCount",
           -- Lý do "nguy cơ rời bỏ" bằng mã (giao diện dịch ra chữ): chưa từng hoạt động / 21 ngày không hoạt động /
           -- gói sắp hết hạn trong 7 ngày.
           (CASE
              WHEN la.at IS NULL THEN 'never_active'
              WHEN la.at < NOW() - INTERVAL '21 days' THEN 'inactive_21d'
              WHEN ${expiringSql('u', 7)} THEN 'expiring_7d'
              ELSE NULL
            END) AS "churnRiskReason"
         FROM users u
         LEFT JOIN plans p ON p.id = u.active_plan_id
         LEFT JOIN user_two_factor tf ON tf.user_id = u.id AND tf.enabled_at IS NOT NULL
         LEFT JOIN LATERAL (
           SELECT GREATEST(u.last_login_at, MAX(rt.created_at)) AS at
             FROM refresh_tokens rt
            WHERE rt.id_user = u.id
         ) la ON TRUE
         WHERE ${where}
       ) t
      ORDER BY t."subscriptionExpiresAt" ASC NULLS LAST, t."createdAt" DESC`,
    params
  );
  return rows;
}

/**
 * Năm số đầu trang Thành viên + đếm các nhóm còn lại (để bộ lọc nhóm ghi số). Mọi số "khách" đều theo định nghĩa ở
 * customerDefinitions.js; `expiring7d` / `expired30d` gồm cả khách dùng thử (khớp bộ lọc `planState`), `expiring7dPaying`
 * là phần khách trả tiền trong đó (con số của Tổng quan).
 */
export async function getMembersSummary() {
  const { rows } = await db.query(
    `WITH c AS (
       SELECT ${customerSegmentSql('u')} AS segment,
              ${payingSql('u')} AS is_paying,
              ${activePlanSql('u')} AS is_active,
              ${expiringSql('u', 7)} AS is_expiring,
              ${expiredWithinSql('u', 30)} AS is_expired30
         FROM users u
     )
     SELECT
       COUNT(*) FILTER (WHERE segment = 'customer') AS customers,
       COUNT(*) FILTER (WHERE segment = 'customer' AND is_paying) AS paying,
       COUNT(*) FILTER (WHERE segment = 'customer' AND is_active AND NOT is_paying) AS trial,
       COUNT(*) FILTER (WHERE segment = 'customer' AND is_expiring) AS "expiring7d",
       COUNT(*) FILTER (WHERE segment = 'customer' AND is_paying AND is_expiring) AS "expiring7dPaying",
       COUNT(*) FILTER (WHERE segment = 'customer' AND is_expired30) AS "expired30d",
       COUNT(*) FILTER (WHERE segment = 'employee') AS employees,
       COUNT(*) FILTER (WHERE segment = 'internal') AS internal,
       COUNT(*) FILTER (WHERE segment = 'deleted') AS deleted
     FROM c`
  );
  const row = rows[0] || {};
  const n = (value) => Number(value || 0);
  return {
    customers: n(row.customers),
    paying: n(row.paying),
    trial: n(row.trial),
    expiring7d: n(row.expiring7d),
    expiring7dPaying: n(row.expiring7dPaying),
    expired30d: n(row.expired30d),
    employees: n(row.employees),
    internal: n(row.internal),
    deleted: n(row.deleted),
  };
}

export async function findMemberById(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.email, u.full_name AS "fullName", u.status, u.role, u.created_at AS "createdAt",
            u.active_plan_id AS "activePlanId",
            u.phone AS "phone", u.phone_verified_at AS "phoneVerifiedAt",
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
             deleted_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND status != 'deleted'
       RETURNING id, email, username, status, deleted_at`,
      [id]
    );
    const updatedUser = rows[0] || null;
    if (!updatedUser) {
      await client.query('ROLLBACK');
      return null;
    }

    // Tài khoản đã xoá không đăng nhập được nữa (resolveUserContext chỉ nhận active/pending_activation),
    // nhưng dòng user_members của họ vẫn nằm lại: là NHÂN VIÊN thì chiếm một suất trong hạn mức nhân viên
    // của chủ shop (production 21/09/2026: user 7 đã xoá vẫn chiếm 1/3 suất của tài khoản 1); là CHỦ thì
    // nhân viên cũ vẫn đổi được sang không gian của tài khoản đã xoá và đọc dữ liệu trong đó. Gỡ cả hai chiều.
    const membershipRes = await client.query(
      'DELETE FROM user_members WHERE employee_id = $1 OR owner_id = $1',
      [id]
    );

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
      removedMembershipsCount: membershipRes.rowCount || 0,
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
         UNION ALL
         SELECT 1 FROM affiliate_withdrawals WHERE user_id = $1
       ) AS "hasAffiliateActivity",
       EXISTS(SELECT 1 FROM user_consents WHERE user_id = $1) AS "hasConsents"`,
    [id]
  );
  const row = rows[0] || {};
  const reasons = [];
  if (row.hasOrders) reasons.push('đơn hàng thành công');
  if (row.hasMarketplace) reasons.push('dữ liệu marketplace (đã đăng bán/mua/đánh giá/yêu thích)');
  if (row.hasAffiliateActivity) reasons.push('hoạt động affiliate (doanh thu giới thiệu hoặc được giới thiệu)');
  if (row.hasConsents) reasons.push('bằng chứng đồng ý điều khoản/dữ liệu cá nhân (user_consents)');
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
