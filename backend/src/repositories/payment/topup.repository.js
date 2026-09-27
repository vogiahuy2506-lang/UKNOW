import db from '../../config/database.js';
import { TOPUP_CONSUMABLE_KEYS, TOPUP_STRUCTURAL_KEYS } from '../../utils/topupPricing.util.js';

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
 * Một dòng giá topup theo item_key, KỂ CẢ khi đang tắt bán (is_active=FALSE) — dùng để quyết định
 * có gợi ý "mua thêm slot" hay không (chỗ cần is_active=TRUE mới gợi ý, không phải chỗ liệt kê
 * catalog cho khách chọn mua, đã có findAllTopupPricing ở trên).
 *
 * @param {string} itemKey
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<{itemKey: string, unitPrice: number, isActive: boolean, minQty: number, stepQty: number, maxQty: number|null}|null>}
 */
export async function findTopupPricingByKey(itemKey, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT item_key AS "itemKey", unit_price AS "unitPrice", is_active AS "isActive",
            min_qty AS "minQty", step_qty AS "stepQty", max_qty AS "maxQty"
     FROM topup_pricing
     WHERE item_key = $1`,
    [itemKey]
  );
  return rows[0] || null;
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

/**
 * Món cấu trúc (TOPUP_STRUCTURAL_KEYS) sắp hết hạn trong 7 ngày tới mà khách CHƯA gia hạn.
 *
 * "Gia hạn" = mua thêm một grant MỚI (cùng item_key) chạy song song — grant cũ vẫn hết hạn đúng
 * hạn của nó, không bị sửa. Vì vậy không thể chỉ nhìn "có grant nào hết hạn trong 7 ngày" mà phải
 * trừ đi phần đã được một grant mua SAU đó (created_at mới hơn) "gánh" — grant mới đó hết hạn SAU
 * mốc 7 ngày thì coi như khách đã lo xong, không cần nhắc nữa dù grant cũ vẫn nằm trong sổ.
 *
 * Với mỗi item_key còn cần nhắc:
 *   qty = tổng qty grant hết hạn trong (NOW, NOW+7d]
 *       − tổng qty grant hết hạn SAU NOW+7d, được tạo SAU grant sắp hết hạn sớm nhất (cùng key)
 *         VÀ được tạo trong 7 ngày trước mốc hết hạn sớm nhất (mua sớm hơn = slot thêm độc lập)
 *   cycleEnd = mốc hết hạn sớm nhất trong nhóm (NOW, NOW+7d] của item_key đó.
 * Chỉ trả các item_key có qty (sau khi trừ) > 0.
 *
 * @param {number|string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<Array<{itemKey: string, qty: number, cycleEnd: Date}>>}
 */
export async function findExpiringUnrenewedGrants(userId, queryable = db) {
  const { rows } = await queryable.query(
    `WITH expiring AS (
       SELECT item_key, qty, cycle_end, created_at
       FROM topup_grants
       WHERE user_id = $1
         AND item_key = ANY($2::text[])
         AND cycle_end IS NOT NULL
         AND cycle_end > NOW()
         AND cycle_end <= NOW() + INTERVAL '7 days'
     ),
     earliest AS (
       SELECT DISTINCT ON (item_key) item_key, cycle_end AS earliest_cycle_end, created_at AS earliest_created_at
       FROM expiring
       ORDER BY item_key, cycle_end ASC
     ),
     expiring_sum AS (
       SELECT item_key, SUM(qty)::int AS expiring_qty
       FROM expiring
       GROUP BY item_key
     ),
     renewed_sum AS (
       SELECT tg.item_key, SUM(tg.qty)::int AS renewed_qty
       FROM topup_grants tg
       JOIN earliest e ON e.item_key = tg.item_key
       WHERE tg.user_id = $1
         AND tg.cycle_end IS NOT NULL
         AND tg.cycle_end > NOW() + INTERVAL '7 days'
         AND tg.created_at > e.earliest_created_at
         -- Chỉ tính là gia hạn khi mua TRONG 7 ngày trước khi grant cũ hết hạn (lúc khách đã được
         -- nhắc). Grant mua sớm hơn là slot mua THÊM độc lập, không phải gia hạn — không được
         -- dùng nó để tắt nhắc, kẻo khách mất slot cũ mà không được báo (review 27/09).
         AND tg.created_at >= e.earliest_cycle_end - INTERVAL '7 days'
       GROUP BY tg.item_key
     )
     SELECT es.item_key AS "itemKey",
            (es.expiring_qty - COALESCE(rs.renewed_qty, 0))::int AS qty,
            e.earliest_cycle_end AS "cycleEnd"
     FROM expiring_sum es
     JOIN earliest e ON e.item_key = es.item_key
     LEFT JOIN renewed_sum rs ON rs.item_key = es.item_key
     WHERE (es.expiring_qty - COALESCE(rs.renewed_qty, 0)) > 0
     ORDER BY e.earliest_cycle_end ASC`,
    [userId, TOPUP_STRUCTURAL_KEYS]
  );
  return rows;
}
