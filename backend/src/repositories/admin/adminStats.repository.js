import db from '../../config/database.js';
import {
  VN_TZ as TZ,
  activePlanSql,
  customerSql,
  expiringSql,
  payingSql,
} from '../../services/admin/customerDefinitions.js';
import {
  orderKindSql,
  orderPeriodAtSql,
  paidAfterCancelledSql,
  paidOrderSql,
} from '../../services/admin/revenueDefinitions.js';

/**
 * Số liệu Tổng quan admin (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9).
 *
 * "Khách" và "khách trả tiền" lấy từ customerDefinitions.js, "đơn đã trả" / mốc kỳ từ revenueDefinitions.js — không
 * viết lại điều kiện ở đây. Mọi mốc tháng tính TRONG SQL theo giờ VN và trả ra dạng chuỗi (to_char): trả cột
 * timestamp về JS thì node-pg dựng Date theo giờ máy và ra JSON lệch một ngày / một tháng.
 */

const num = (value) => Number(value || 0);

/**
 * KPI tháng này (theo lịch, giờ VN).
 *
 * Doanh thu = đơn đã trả có mốc kỳ trong tháng, tách "gói · mua thêm · gán tay" (ba nhóm không chồng lấn, cộng lại bằng
 * doanh thu). Đơn hoàn tự rơi khỏi tổng (status 'refunded'); số đã hoàn của tháng đọc riêng theo `refunded_at`.
 *
 * "Cùng kỳ tháng trước" = từ đầu tháng trước tới CÙNG NGÀY GIỜ của tháng trước (không phải cả tháng trước): so tháng
 * đang dở với tháng trước đủ làm ngày 3 hàng tháng luôn hiện "âm mạnh".
 */
export async function getKpiStats() {
  const [revenueRes, customersRes, attentionRes] = await Promise.all([
    db.query(
      `WITH b AS (
         SELECT date_trunc('month', NOW() AT TIME ZONE $1) AS m0,
                NOW() AT TIME ZONE $1 AS now_vn
       ),
       x AS (
         SELECT o.amount, ${orderKindSql('o')} AS kind, (${orderPeriodAtSql('o')} AT TIME ZONE $1) AS p
           FROM orders o
          WHERE ${paidOrderSql('o')}
       )
       SELECT
         to_char(b.m0, 'YYYY-MM') AS "monthKey",
         to_char(b.m0, 'MM/YYYY') AS "monthLabel",
         to_char(b.now_vn, 'DD/MM') AS "todayLabel",
         COALESCE(SUM(x.amount) FILTER (WHERE x.p >= b.m0 AND x.p < b.m0 + INTERVAL '1 month'), 0) AS revenue,
         COALESCE(SUM(x.amount) FILTER (WHERE x.p >= b.m0 AND x.p < b.m0 + INTERVAL '1 month' AND x.kind = 'plan'), 0) AS "revenuePlan",
         COALESCE(SUM(x.amount) FILTER (WHERE x.p >= b.m0 AND x.p < b.m0 + INTERVAL '1 month' AND x.kind = 'topup'), 0) AS "revenueTopup",
         COALESCE(SUM(x.amount) FILTER (WHERE x.p >= b.m0 AND x.p < b.m0 + INTERVAL '1 month' AND x.kind = 'manual'), 0) AS "revenueManual",
         COUNT(*) FILTER (WHERE x.p >= b.m0 AND x.p < b.m0 + INTERVAL '1 month') AS "paidOrders",
         COALESCE(SUM(x.amount) FILTER (
           WHERE x.p >= b.m0 - INTERVAL '1 month'
             AND x.p < LEAST(b.m0 - INTERVAL '1 month' + (b.now_vn - b.m0), b.m0)
         ), 0) AS "revenuePrev",
         (SELECT COALESCE(SUM(r.amount), 0) FROM orders r
           WHERE r.status = 'refunded'
             AND (r.refunded_at AT TIME ZONE $1) >= b.m0
             AND (r.refunded_at AT TIME ZONE $1) < b.m0 + INTERVAL '1 month') AS refunded
       FROM b LEFT JOIN x ON TRUE
       GROUP BY b.m0, b.now_vn`,
      [TZ]
    ),
    db.query(
      `WITH b AS (
         SELECT date_trunc('month', NOW() AT TIME ZONE $1) AS m0,
                NOW() AT TIME ZONE $1 AS now_vn
       ),
       c AS (
         SELECT (u.created_at AT TIME ZONE $1) AS created_vn,
                ${activePlanSql('u')} AS is_active,
                ${payingSql('u')} AS is_paying,
                ${expiringSql('u', 7)} AS is_expiring
           FROM users u
          WHERE ${customerSql('u')}
       )
       SELECT
         COUNT(c.created_vn) AS total,
         COUNT(*) FILTER (WHERE c.is_paying) AS paying,
         COUNT(*) FILTER (WHERE c.is_active AND NOT c.is_paying) AS trial,
         COUNT(*) FILTER (WHERE c.is_paying AND c.is_expiring) AS "expiringPaid7d",
         COUNT(*) FILTER (WHERE c.created_vn >= b.m0 AND c.created_vn < b.m0 + INTERVAL '1 month') AS "newThisMonth",
         COUNT(*) FILTER (
           WHERE c.created_vn >= b.m0 - INTERVAL '1 month'
             AND c.created_vn < LEAST(b.m0 - INTERVAL '1 month' + (b.now_vn - b.m0), b.m0)
         ) AS "newPrev"
       FROM b LEFT JOIN c ON TRUE
       GROUP BY b.m0, b.now_vn`,
      [TZ]
    ),
    db.query(
      // "Rút tiền quá hạn": yêu cầu pending đã quá 7 NGÀY LÀM VIỆC (trừ Thứ Bảy / Chủ Nhật, không trừ ngày lễ) kể từ
      // ngày yêu cầu, không tính ngày yêu cầu — cùng cách đếm với affiliateWithdrawalUrgency.util.js ở giao diện
      // (lời hứa "chi trả trong 07 ngày làm việc", ToS 15.3). generate_series phải ép ::timestamp: truyền date thì
      // Postgres chọn biến thể timestamptz và kết quả phụ thuộc múi giờ phiên.
      `SELECT
         (SELECT COUNT(*)::int FROM orders o WHERE ${paidAfterCancelledSql('o')}) AS "paidAfterCancelledCount",
         (SELECT COALESCE(SUM(o.amount), 0) FROM orders o WHERE ${paidAfterCancelledSql('o')}) AS "paidAfterCancelledAmount",
         (SELECT COUNT(*)::int FROM affiliate_withdrawals w
           WHERE w.status = 'pending'
             AND (
               SELECT COUNT(*) FROM generate_series(
                 ((w.requested_at AT TIME ZONE $1)::date + 1)::timestamp,
                 (NOW() AT TIME ZONE $1)::date::timestamp,
                 INTERVAL '1 day'
               ) d WHERE EXTRACT(ISODOW FROM d) < 6
             ) > 7) AS "overdueWithdrawals"`,
      [TZ]
    ),
  ]);

  const r = revenueRes.rows[0] || {};
  const c = customersRes.rows[0] || {};
  const a = attentionRes.rows[0] || {};
  return {
    monthKey: r.monthKey,
    monthLabel: r.monthLabel,
    todayLabel: r.todayLabel,
    revenueThisMonth: num(r.revenue),
    revenueBySource: {
      plan: num(r.revenuePlan),
      topup: num(r.revenueTopup),
      manual: num(r.revenueManual),
    },
    refundedThisMonth: num(r.refunded),
    revenuePrevSamePeriod: num(r.revenuePrev),
    paidOrdersThisMonth: num(r.paidOrders),
    totalCustomers: num(c.total),
    payingCustomers: num(c.paying),
    trialCustomers: num(c.trial),
    expiringPaid7d: num(c.expiringPaid7d),
    newCustomersThisMonth: num(c.newThisMonth),
    newCustomersPrevSamePeriod: num(c.newPrev),
    paidAfterCancelledCount: num(a.paidAfterCancelledCount),
    paidAfterCancelledAmount: num(a.paidAfterCancelledAmount),
    overdueWithdrawals: num(a.overdueWithdrawals),
  };
}

/**
 * Doanh thu + số đơn đã trả theo tháng: 6 THÁNG DƯƠNG LỊCH đầy đủ (tháng này và 5 tháng trước, giờ VN), tháng không có
 * đơn hiện 0 (không biến mất khỏi biểu đồ). Trước đây `created_at >= NOW() - '6 months'` cho tới 7 cột với cột đầu chỉ
 * có vài ngày.
 */
export async function getMonthlyRevenue() {
  const { rows } = await db.query(
    `WITH b AS (SELECT date_trunc('month', NOW() AT TIME ZONE $1) AS m0),
     months AS (SELECT generate_series(b.m0 - INTERVAL '5 months', b.m0, INTERVAL '1 month') AS m FROM b),
     x AS (
       SELECT o.amount, date_trunc('month', ${orderPeriodAtSql('o')} AT TIME ZONE $1) AS m
         FROM orders o
        WHERE ${paidOrderSql('o')}
     )
     SELECT to_char(months.m, 'MM/YYYY') AS month,
            to_char(months.m, 'YYYY-MM') AS "monthKey",
            COALESCE(SUM(x.amount), 0) AS revenue,
            COUNT(x.amount) AS "paidOrders"
       FROM months LEFT JOIN x ON x.m = months.m
      GROUP BY months.m
      ORDER BY months.m ASC`,
    [TZ]
  );
  return rows.map((row) => ({
    month: row.month,
    monthKey: row.monthKey,
    revenue: num(row.revenue),
    paidOrders: num(row.paidOrders),
  }));
}

/**
 * Số khách đang có gói còn hiệu lực theo từng gói. Mọi gói tự chọn (is_custom) gộp thành MỘT nhóm "Gói tuỳ chọn" —
 * mỗi khách một gói riêng tên "Gói tự chọn — <email> — <yyyy-mm>" làm mỗi dòng chỉ có 1 người.
 */
export async function getPlanDistribution() {
  const { rows } = await db.query(
    `SELECT CASE WHEN p.is_custom THEN 'Gói tuỳ chọn' ELSE p.name END AS name,
            CASE WHEN p.is_custom THEN 'custom' ELSE p.code END AS code,
            MAX(p.price) AS price,
            COUNT(*)::int AS "userCount"
       FROM users u
       JOIN plans p ON p.id = u.active_plan_id
      WHERE ${customerSql('u')} AND ${activePlanSql('u')}
      GROUP BY 1, 2
      ORDER BY MAX(p.price) ASC, 1`
  );
  return rows;
}

/** 10 đơn hàng gần nhất */
export async function getRecentOrders(limit = 10) {
  const { rows } = await db.query(`
    SELECT
      o.id,
      o.order_code AS "orderCode",
      o.amount,
      o.status,
      o.created_at AS "createdAt",
      o.user_email AS "userEmail",
      p.name  AS "planName",
      p.code  AS "planCode"
    FROM orders o
    LEFT JOIN plans p ON o.plan_id = p.id
    ORDER BY o.created_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

/** Khách mới nhất (theo định nghĩa khách: không gồm nhân viên / tài khoản nội bộ / đã xoá / admin). */
export async function getRecentMembers(limit = 10) {
  const { rows } = await db.query(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name AS "fullName",
      u.created_at AS "createdAt",
      u.active_plan_id AS "activePlanId",
      p.name AS "planName",
      p.code AS "planCode"
    FROM users u
    LEFT JOIN plans p ON p.id = u.active_plan_id
    WHERE ${customerSql('u')}
    ORDER BY u.created_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

/** Khách sắp hết hạn trong N ngày tới */
export async function getExpiringSoon(days = 7) {
  const { rows } = await db.query(`
    SELECT
      u.email,
      u.full_name AS "fullName",
      p.name AS "planName",
      u.subscription_expires_at AS "expiresAt",
      EXTRACT(DAY FROM (u.subscription_expires_at - NOW()))::INTEGER AS "daysLeft"
    FROM users u
    LEFT JOIN plans p ON p.id = u.active_plan_id
    WHERE ${customerSql('u')}
      AND ${expiringSql('u', days)}
    ORDER BY u.subscription_expires_at ASC
  `);
  return rows;
}

/** Tổng quan chiến dịch trên toàn nền tảng */
export async function getCampaignStats() {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM campaigns)                                        AS "totalCampaigns",
      (SELECT COUNT(*) FROM campaigns WHERE status = 'active')               AS "activeCampaigns",
      (SELECT COUNT(*) FROM campaigns WHERE status = 'completed')            AS "completedCampaigns",
      (SELECT COUNT(*) FROM campaigns
        WHERE created_at >= NOW() - INTERVAL '30 days')                      AS "newLast30Days",
      (SELECT COUNT(DISTINCT id_user) FROM campaigns)                        AS "usersWithCampaigns"
  `);
  return rows[0];
}

/** Khách mới theo tuần (4 tuần gần nhất) */
export async function getNewUsersWeekly() {
  const { rows } = await db.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('week', u.created_at AT TIME ZONE $1), 'DD/MM') AS week,
      COUNT(*) AS "newUsers"
    FROM users u
    WHERE ${customerSql('u')}
      AND u.created_at >= NOW() - INTERVAL '4 weeks'
    GROUP BY DATE_TRUNC('week', u.created_at AT TIME ZONE $1)
    ORDER BY DATE_TRUNC('week', u.created_at AT TIME ZONE $1) ASC
  `, [TZ]);
  return rows;
}
