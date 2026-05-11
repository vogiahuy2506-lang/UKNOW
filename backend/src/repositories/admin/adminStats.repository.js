import db from '../../config/database.js';

const TZ = 'Asia/Ho_Chi_Minh';

/** KPI tổng quan: thành viên, doanh thu, đơn hàng tháng này */
export async function getKpiStats() {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'user_admin')                                    AS "totalMembers",
      (SELECT COUNT(*) FROM users WHERE role = 'user_admin' AND active_plan_id IS NOT NULL)     AS "activeMembers",
      (SELECT COUNT(*) FROM users WHERE role = 'employee')                                      AS "totalEmployees",
      (SELECT COALESCE(SUM(amount), 0) FROM orders
        WHERE status = 'completed'
          AND DATE_TRUNC('month', created_at AT TIME ZONE $1) = DATE_TRUNC('month', NOW() AT TIME ZONE $1)
      ) AS "revenueThisMonth",
      (SELECT COUNT(*) FROM orders
        WHERE DATE_TRUNC('month', created_at AT TIME ZONE $1) = DATE_TRUNC('month', NOW() AT TIME ZONE $1)
      ) AS "ordersThisMonth",
      (SELECT COUNT(*) FROM orders WHERE status = 'completed'
          AND DATE_TRUNC('month', created_at AT TIME ZONE $1) = DATE_TRUNC('month', NOW() AT TIME ZONE $1)
      ) AS "completedOrdersThisMonth",
      (SELECT COUNT(*) FROM orders WHERE status = 'pending'
          AND DATE_TRUNC('month', created_at AT TIME ZONE $1) = DATE_TRUNC('month', NOW() AT TIME ZONE $1)
      ) AS "pendingOrdersThisMonth"
  `, [TZ]);
  return rows[0];
}

/** Doanh thu + số đơn theo tháng (6 tháng gần nhất) */
export async function getMonthlyRevenue() {
  const { rows } = await db.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE $1), 'MM/YYYY') AS month,
      DATE_TRUNC('month', created_at AT TIME ZONE $1)                      AS "monthDate",
      COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS revenue,
      COUNT(*) AS "totalOrders",
      COUNT(CASE WHEN status = 'completed' THEN 1 END) AS "completedOrders"
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE $1)
    ORDER BY "monthDate" ASC
  `, [TZ]);
  return rows;
}

/** Số user_admin theo từng gói dịch vụ */
export async function getPlanDistribution() {
  const { rows } = await db.query(`
    SELECT
      p.id,
      p.name,
      p.code,
      p.price,
      COUNT(u.id) AS "userCount"
    FROM plans p
    LEFT JOIN users u ON u.active_plan_id = p.id AND u.role = 'user_admin'
    WHERE p.is_active = true
    GROUP BY p.id, p.name, p.code, p.price
    ORDER BY p.price ASC
  `);
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

/** 10 thành viên (user_admin) mới nhất */
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
    WHERE u.role = 'user_admin'
    ORDER BY u.created_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

/** Thành viên sắp hết hạn trong N ngày tới */
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
    WHERE u.role = 'user_admin'
      AND u.subscription_expires_at IS NOT NULL
      AND u.subscription_expires_at > NOW()
      AND u.subscription_expires_at <= NOW() + ($1 || ' days')::INTERVAL
    ORDER BY u.subscription_expires_at ASC
  `, [days]);
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
      (SELECT COUNT(DISTINCT owner_id) FROM campaigns)                       AS "usersWithCampaigns"
  `);
  return rows[0];
}

/** Thống kê user mới theo tuần (4 tuần gần nhất) */
export async function getNewUsersWeekly() {
  const { rows } = await db.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('week', created_at AT TIME ZONE $1), 'DD/MM') AS week,
      COUNT(*) AS "newUsers"
    FROM users
    WHERE role = 'user_admin'
      AND created_at >= NOW() - INTERVAL '4 weeks'
    GROUP BY DATE_TRUNC('week', created_at AT TIME ZONE $1)
    ORDER BY DATE_TRUNC('week', created_at AT TIME ZONE $1) ASC
  `, [TZ]);
  return rows;
}
