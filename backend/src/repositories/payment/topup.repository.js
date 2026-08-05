import db from '../../config/database.js';

/**
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function findAllTopupPricing(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT item_key, unit_price, min_qty, step_qty, max_qty, is_active, sort_order
     FROM topup_pricing
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, item_key ASC`
  );
  return rows;
}

/**
 * Sum active top-up grants for a billing owner, neo theo subscription_expires_at hiện tại.
 *
 * @param {number|string} userId
 * @param {string} itemKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<number>}
 */
export async function sumActiveTopupGrants(userId, itemKey, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(tg.qty), 0)::int AS total
     FROM topup_grants tg
     WHERE tg.user_id = $1
       AND tg.item_key = $2
       AND tg.cycle_end = (
         SELECT u.subscription_expires_at FROM users u WHERE u.id = $1
       )`,
    [userId, itemKey]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * Insert grants for each positive qty item. Idempotent via UNIQUE(order_id, item_key).
 *
 * @param {{
 *   userId: number|string,
 *   orderId: number|string,
 *   cycleEnd: Date|string,
 *   quantities: Record<string, number>,
 * }} input
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function insertTopupGrants({ userId, orderId, cycleEnd, quantities }, queryable = db) {
  const entries = Object.entries(quantities || {}).filter(([, qty]) => Number(qty) > 0);
  const inserted = [];
  for (const [itemKey, qty] of entries) {
    const { rows } = await queryable.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id, item_key) DO NOTHING
       RETURNING id, user_id, item_key, qty, order_id, cycle_end`,
      [userId, itemKey, Number(qty), orderId, cycleEnd]
    );
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

/**
 * @param {number|string} orderId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function findGrantsByOrderId(orderId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, user_id, item_key, qty, order_id, cycle_end, created_at
     FROM topup_grants
     WHERE order_id = $1
     ORDER BY item_key`,
    [orderId]
  );
  return rows;
}
