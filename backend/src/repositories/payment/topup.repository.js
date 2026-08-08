import db from '../../config/database.js';
import { TOPUP_CONSUMABLE_KEYS } from '../../utils/topupPricing.util.js';

const CONSUMABLE_KEY_SET = new Set(TOPUP_CONSUMABLE_KEYS);

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
 * Sum active structural grants (cycle_end > NOW()) or wallet grants for consumables.
 *
 * @param {number|string} userId
 * @param {string} itemKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<number>}
 */
export async function sumActiveTopupGrants(userId, itemKey, queryable = db) {
  if (CONSUMABLE_KEY_SET.has(itemKey)) {
    return sumWalletGrants(userId, itemKey, queryable);
  }
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(tg.qty), 0)::int AS total
     FROM topup_grants tg
     WHERE tg.user_id = $1
       AND tg.item_key = $2
       AND tg.cycle_end IS NOT NULL
       AND tg.cycle_end > NOW()`,
    [userId, itemKey]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * Sum permanent wallet grants (consumable): cycle_end IS NULL.
 *
 * @param {number|string} userId
 * @param {string} itemKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<number>}
 */
export async function sumWalletGrants(userId, itemKey, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(tg.qty), 0)::int AS total
     FROM topup_grants tg
     WHERE tg.user_id = $1
       AND tg.item_key = $2
       AND tg.cycle_end IS NULL`,
    [userId, itemKey]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * @param {number|string} userId
 * @param {string} itemKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<number>}
 */
export async function sumWalletDebits(userId, itemKey, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COALESCE(SUM(td.qty), 0)::int AS total
     FROM topup_debits td
     WHERE td.user_id = $1
       AND td.item_key = $2`,
    [userId, itemKey]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * @param {number|string} userId
 * @param {string} itemKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<{ granted: number, used: number, remaining: number, rawRemaining: number }>}
 */
export async function getWalletBalance(userId, itemKey, queryable = db) {
  const [granted, used] = await Promise.all([
    sumWalletGrants(userId, itemKey, queryable),
    sumWalletDebits(userId, itemKey, queryable),
  ]);
  const rawRemaining = granted - used;
  return {
    granted,
    used,
    remaining: Math.max(0, rawRemaining),
    rawRemaining,
  };
}

/**
 * Advisory lock for wallet mutations (same pattern as usageTracking).
 * @param {import('pg').PoolClient} client
 * @param {number|string} userId
 * @param {string} itemKey
 */
export async function acquireWalletLock(client, userId, itemKey) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
    [`topup_wallet:${userId}`, String(itemKey)]
  );
}

/**
 * Insert a wallet debit. Idempotent via UNIQUE(item_key, source_key).
 * Does NOT enforce granted >= used (negative balance allowed for in-flight sends).
 *
 * @param {{
 *   userId: number|string,
 *   itemKey: string,
 *   qty?: number,
 *   sourceKey: string,
 * }} input
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<object|null>} inserted row or null if conflict
 */
export async function insertTopupDebit({
  userId,
  itemKey,
  qty = 1,
  sourceKey,
}, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO topup_debits (user_id, item_key, qty, source_key)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (item_key, source_key) DO NOTHING
     RETURNING id, user_id, item_key, qty, source_key, created_at`,
    [userId, itemKey, Number(qty) || 1, String(sourceKey)]
  );
  return rows[0] || null;
}

/**
 * Insert grants for each positive qty item. Idempotent via UNIQUE(order_id, item_key).
 * Consumable keys always get cycle_end NULL (ignore cycleEndForStructural for those).
 *
 * @param {{
 *   userId: number|string,
 *   orderId: number|string,
 *   cycleEnd: Date|string|null,
 *   quantities: Record<string, number>,
 * }} input
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function insertTopupGrants({ userId, orderId, cycleEnd, quantities }, queryable = db) {
  const entries = Object.entries(quantities || {}).filter(([, qty]) => Number(qty) > 0);
  const inserted = [];
  for (const [itemKey, qty] of entries) {
    const isConsumable = CONSUMABLE_KEY_SET.has(itemKey);
    const rowCycleEnd = isConsumable ? null : cycleEnd;
    if (!isConsumable && (rowCycleEnd == null || rowCycleEnd === '')) {
      throw new Error(`Top-up structural item ${itemKey} requires cycle_end`);
    }
    const { rows } = await queryable.query(
      `INSERT INTO topup_grants (user_id, item_key, qty, order_id, cycle_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id, item_key) DO NOTHING
       RETURNING id, user_id, item_key, qty, order_id, cycle_end`,
      [userId, itemKey, Number(qty), orderId, rowCycleEnd]
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
