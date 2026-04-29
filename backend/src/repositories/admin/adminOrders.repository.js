import db from '../../config/database.js';

export async function findOrders({ status, search, dateFrom, dateTo, page = 1, limit = 20 }) {
  const conditions = ['1=1'];
  const params = [];
  let p = 1;

  if (status)   { conditions.push(`o.status = $${p++}`);          params.push(status); }
  if (dateFrom) { conditions.push(`o.created_at >= $${p++}`);     params.push(dateFrom); }
  if (dateTo)   { conditions.push(`o.created_at < $${p++}`);      params.push(dateTo); }
  if (search) {
    conditions.push(`(o.user_email ILIKE $${p} OR CAST(o.order_code AS TEXT) ILIKE $${p})`);
    params.push(`%${search}%`); p++;
  }

  const where = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [rowsRes, countRes] = await Promise.all([
    db.query(
      `SELECT o.id, o.order_code, o.amount, o.status, o.created_at, o.updated_at,
              o.user_email, o.user_id,
              p.name AS plan_name, p.code AS plan_code, p.is_custom,
              u.full_name AS user_full_name
       FROM orders o
       LEFT JOIN plans p ON o.plan_id = p.id
       LEFT JOIN users u ON o.user_id = u.id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset]
    ),
    db.query(`SELECT COUNT(*) FROM orders o WHERE ${where}`, params),
  ]);

  return { rows: rowsRes.rows, total: Number(countRes.rows[0].count) };
}

export async function findOrderByCode(orderCode) {
  const { rows } = await db.query(
    `SELECT id, order_code, status, plan_id, user_id, user_email FROM orders WHERE order_code = $1`,
    [orderCode]
  );
  return rows[0] || null;
}

export async function setOrderCancelled(orderCode) {
  await db.query(
    `UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE order_code = $1`,
    [orderCode]
  );
}

export async function getOrdersKpi() {
  const { rows } = await db.query(`
    SELECT
      COUNT(*)                                                        AS total_orders,
      COUNT(CASE WHEN status = 'success'   THEN 1 END)               AS success_count,
      COUNT(CASE WHEN status = 'pending'   THEN 1 END)               AS pending_count,
      COUNT(CASE WHEN status = 'cancelled' THEN 1 END)               AS cancelled_count,
      COALESCE(SUM(CASE WHEN status = 'success' THEN amount END), 0) AS total_revenue
    FROM orders
  `);
  return rows[0];
}
