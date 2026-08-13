import db from '../config/database.js';
import {
  CODE_OFFER_MODES,
  normalizeUserVoucherCode,
  offerModeToAutoApply,
  resolveOfferMode,
} from '../utils/voucherOffer.util.js';

const VOUCHER_SELECT = `
  id, code, name, description,
  discount_type AS "discountType",
  discount_value AS "discountValue",
  max_discount_amount AS "maxDiscountAmount",
  min_order_amount AS "minOrderAmount",
  applies_to_plan_codes AS "appliesToPlanCodes",
  applies_to_billing_periods AS "appliesToBillingPeriods",
  starts_at AS "startsAt",
  ends_at AS "endsAt",
  usage_limit AS "usageLimit",
  usage_limit_per_user AS "usageLimitPerUser",
  used_count AS "usedCount",
  auto_apply AS "autoApply",
  offer_mode AS "offerMode",
  stackable,
  is_active AS "isActive",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const mapRow = (row) => {
  if (!row) return null;
  const offerMode = resolveOfferMode(row);
  return {
    ...row,
    offerMode,
    autoApply: offerMode === 'automatic',
  };
};

const mapRows = (rows) => (rows || []).map(mapRow);

export const normalizeVoucherCode = (code) => normalizeUserVoucherCode(code);

/** Default matches typical PayOS VietQR link window when expiredAt is set explicitly. */
export function getPayosPendingWindowMinutes() {
  const n = Number(process.env.PAYOS_PENDING_WINDOW_MINUTES);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
}

export async function findAdminVouchers({ offerMode = null } = {}) {
  const params = [];
  let where = '';
  if (offerMode) {
    params.push(offerMode);
    where = `WHERE offer_mode = $1`;
  }
  const { rows } = await db.query(
    `
    SELECT ${VOUCHER_SELECT}
    FROM vouchers
    ${where}
    ORDER BY created_at DESC, id DESC
  `,
    params
  );
  return mapRows(rows);
}

export async function findVoucherById(id, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${VOUCHER_SELECT} FROM vouchers WHERE id = $1`,
    [id]
  );
  return mapRow(rows[0] || null);
}

export async function findActiveVoucherByCode(code, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${VOUCHER_SELECT}
     FROM vouchers
     WHERE is_active = TRUE AND UPPER(code) = $1
     LIMIT 1`,
    [normalizeVoucherCode(code)]
  );
  return mapRow(rows[0] || null);
}

export async function voucherHasOrderReference(id, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT (
       EXISTS (SELECT 1 FROM orders WHERE voucher_id = $1)
       OR EXISTS (SELECT 1 FROM voucher_redemptions WHERE voucher_id = $1)
     ) AS has_ref`,
    [id]
  );
  return Boolean(rows[0]?.has_ref);
}

export async function createVoucher(payload) {
  const offerMode = resolveOfferMode(payload);
  const autoApply = offerModeToAutoApply(offerMode);
  const { rows } = await db.query(
    `INSERT INTO vouchers (
       code, name, description, discount_type, discount_value, max_discount_amount,
       min_order_amount, applies_to_plan_codes, applies_to_billing_periods,
       starts_at, ends_at, usage_limit, usage_limit_per_user,
       auto_apply, offer_mode, stackable, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING ${VOUCHER_SELECT}`,
    [
      normalizeVoucherCode(payload.code),
      payload.name,
      payload.description || null,
      payload.discountType,
      payload.discountValue,
      payload.maxDiscountAmount,
      payload.minOrderAmount,
      payload.appliesToPlanCodes,
      payload.appliesToBillingPeriods,
      payload.startsAt,
      payload.endsAt,
      payload.usageLimit,
      payload.usageLimitPerUser,
      autoApply,
      offerMode,
      payload.stackable ?? false,
      payload.isActive,
    ]
  );
  return mapRow(rows[0]);
}

export async function updateVoucher(id, payload) {
  const offerMode = resolveOfferMode(payload);
  const autoApply = offerModeToAutoApply(offerMode);
  const { rows } = await db.query(
    `UPDATE vouchers
       SET code = $2,
           name = $3,
           description = $4,
           discount_type = $5,
           discount_value = $6,
           max_discount_amount = $7,
           min_order_amount = $8,
           applies_to_plan_codes = $9,
           applies_to_billing_periods = $10,
           starts_at = $11,
           ends_at = $12,
           usage_limit = $13,
           usage_limit_per_user = $14,
           auto_apply = $15,
           offer_mode = $16,
           stackable = $17,
           is_active = $18,
           updated_at = NOW()
     WHERE id = $1
     RETURNING ${VOUCHER_SELECT}`,
    [
      id,
      normalizeVoucherCode(payload.code),
      payload.name,
      payload.description || null,
      payload.discountType,
      payload.discountValue,
      payload.maxDiscountAmount,
      payload.minOrderAmount,
      payload.appliesToPlanCodes,
      payload.appliesToBillingPeriods,
      payload.startsAt,
      payload.endsAt,
      payload.usageLimit,
      payload.usageLimitPerUser,
      autoApply,
      offerMode,
      payload.stackable ?? false,
      payload.isActive,
    ]
  );
  return mapRow(rows[0] || null);
}

/** Soft-delete: deactivate so redemption history is preserved. */
export async function deleteVoucher(id) {
  const { rows } = await db.query(
    `UPDATE vouchers
        SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

/** Hard delete only when unused — for admin permanent cleanup. */
export async function hardDeleteVoucher(id) {
  const { rows } = await db.query(
    `DELETE FROM vouchers
      WHERE id = $1 AND used_count = 0
      RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function archiveExpiredVouchers(queryable = db) {
  const { rowCount } = await queryable.query(
    `UPDATE vouchers
        SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE
        AND ends_at IS NOT NULL
        AND ends_at < NOW()`
  );
  return rowCount || 0;
}

export async function restoreVoucher(id, { endsAt = undefined } = {}) {
  const current = await findVoucherById(id);
  if (!current) return null;

  const nextEndsAt = endsAt !== undefined ? endsAt : current.endsAt;
  if (nextEndsAt && new Date(nextEndsAt).getTime() <= Date.now()) {
    throw {
      status: 400,
      message: 'Phải đặt ngày kết thúc trong tương lai (hoặc để trống) trước khi khôi phục',
      code: 'VOUCHER_ENDS_AT_REQUIRED',
    };
  }

  const conflict = await findActiveVoucherByCode(current.code);
  if (conflict && Number(conflict.id) !== Number(id)) {
    throw {
      status: 409,
      message: `Mã hiện đang được dùng bởi voucher «${conflict.name}» (ID ${conflict.id}). Đổi mã của voucher này hoặc ngừng voucher kia trước khi khôi phục.`,
      code: 'VOUCHER_CODE_IN_USE',
    };
  }

  const { rows } = await db.query(
    `UPDATE vouchers
        SET is_active = TRUE,
            ends_at = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING ${VOUCHER_SELECT}`,
    [id, nextEndsAt || null]
  );
  return mapRow(rows[0] || null);
}

/**
 * Eligible vouchers for checkout, counting both redemptions and recent pending orders.
 * @param {object} opts
 * @param {string[]|null} [opts.offerModes]
 * @param {import('pg').Pool|import('pg').PoolClient} [opts.queryable]
 */
export async function findEligibleVouchers({
  code = null,
  autoOnly = false,
  manualOnly = false,
  offerModes = null,
  ignoreMinOrder = false,
  planCode,
  billingPeriod,
  amount,
  userId = null,
  userEmail = null,
  pendingWindowMinutes = getPayosPendingWindowMinutes(),
  queryable = db,
} = {}) {
  let modes = Array.isArray(offerModes) ? offerModes.filter(Boolean) : null;
  if (!modes) {
    if (autoOnly) modes = ['automatic'];
    else if (manualOnly) modes = ['public_code'];
  }

  const params = [
    code ? normalizeVoucherCode(code) : null,
    modes && modes.length ? modes : null,
    String(planCode || '').trim().toLowerCase(),
    String(billingPeriod || 'monthly').trim().toLowerCase(),
    Number(amount || 0),
    userId,
    userEmail ? String(userEmail).trim().toLowerCase() : null,
    Boolean(ignoreMinOrder),
    Math.max(1, Number(pendingWindowMinutes) || getPayosPendingWindowMinutes()),
  ];

  const { rows } = await queryable.query(
    `SELECT ${VOUCHER_SELECT}
     FROM vouchers v
     WHERE v.is_active = TRUE
       AND ($1::text IS NULL OR UPPER(v.code) = $1)
       AND (
         $2::text[] IS NULL
         OR v.offer_mode = ANY($2::text[])
       )
       AND (v.starts_at IS NULL OR v.starts_at <= NOW())
       AND (v.ends_at IS NULL OR v.ends_at >= NOW())
       AND ($8::boolean = TRUE OR v.min_order_amount <= $5)
       AND (
         v.usage_limit IS NULL
         OR v.used_count
            + (
              SELECT COUNT(*)::int FROM orders o
              WHERE o.voucher_id = v.id
                AND o.status = 'pending'
                AND o.created_at > NOW() - ($9 || ' minutes')::interval
            )
            < v.usage_limit
       )
       AND (
         EXISTS (SELECT 1 FROM unnest(v.applies_to_plan_codes) AS plan_code WHERE LOWER(plan_code) = $3)
         OR (
           (v.applies_to_plan_codes IS NULL OR cardinality(v.applies_to_plan_codes) = 0)
           AND (
             v.offer_mode <> 'automatic'
             OR $3 <> 'custom'
           )
         )
       )
       AND (
         v.applies_to_billing_periods IS NULL
         OR cardinality(v.applies_to_billing_periods) = 0
         OR EXISTS (SELECT 1 FROM unnest(v.applies_to_billing_periods) AS period WHERE LOWER(period) = $4)
       )
       AND (
         v.usage_limit_per_user IS NULL
         OR (
           (
             SELECT COUNT(*)::int
             FROM voucher_redemptions r
             WHERE r.voucher_id = v.id
               AND (
                 ($6::bigint IS NOT NULL AND r.user_id = $6)
                 OR ($7::text IS NOT NULL AND LOWER(r.user_email) = $7)
               )
           )
           +
           (
             SELECT COUNT(*)::int
             FROM orders o
             WHERE o.voucher_id = v.id
               AND o.status = 'pending'
               AND o.created_at > NOW() - ($9 || ' minutes')::interval
               AND (
                 ($6::bigint IS NOT NULL AND o.user_id = $6)
                 OR ($7::text IS NOT NULL AND LOWER(o.user_email) = $7)
               )
           )
         ) < v.usage_limit_per_user
       )
     ORDER BY v.starts_at DESC NULLS LAST, v.id DESC`,
    params
  );
  return mapRows(rows);
}

/**
 * @param {object} order
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 */
export async function redeemVoucherForOrder(order, queryable = db) {
  if (!order?.voucher_id || Number(order.discount_amount || 0) <= 0) return false;

  const ownsClient = queryable === db;
  const client = ownsClient ? await db.getClient() : queryable;

  try {
    if (ownsClient) await client.query('BEGIN');

    // Soft over-limit warning for ops (do not reject — customer already paid).
    const { rows: limitRows } = await client.query(
      `SELECT usage_limit, usage_limit_per_user, used_count, code, offer_mode
       FROM vouchers WHERE id = $1 FOR UPDATE`,
      [order.voucher_id]
    );
    const voucher = limitRows[0];
    if (voucher) {
      const { rows: userCountRows } = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM voucher_redemptions
         WHERE voucher_id = $1
           AND (
             ($2::bigint IS NOT NULL AND user_id = $2)
             OR ($3::text IS NOT NULL AND LOWER(user_email) = LOWER($3))
           )`,
        [order.voucher_id, order.user_id || null, order.user_email || null]
      );
      const userRedemptions = userCountRows[0]?.n || 0;
      const overGlobal =
        voucher.usage_limit != null && Number(voucher.used_count) >= Number(voucher.usage_limit);
      const overPerUser =
        voucher.usage_limit_per_user != null &&
        userRedemptions >= Number(voucher.usage_limit_per_user);
      if (overGlobal || overPerUser) {
        console.warn(
          `[Voucher] Over-limit redemption allowed after payment: voucher_id=${order.voucher_id} ` +
            `offer_mode=${voucher.offer_mode} order_id=${order.id} ` +
            `used_count=${voucher.used_count}/${voucher.usage_limit ?? '∞'} ` +
            `user_redemptions=${userRedemptions}/${voucher.usage_limit_per_user ?? '∞'}`
        );
      }
    }

    const { rows } = await client.query(
      `WITH inserted AS (
         INSERT INTO voucher_redemptions (voucher_id, order_id, user_id, user_email, discount_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_id) DO NOTHING
         RETURNING voucher_id
       )
       UPDATE vouchers v
          SET used_count = used_count + 1,
              updated_at = NOW()
         FROM inserted
        WHERE v.id = inserted.voucher_id
        RETURNING v.id`,
      [order.voucher_id, order.id, order.user_id || null, order.user_email || null, order.discount_amount]
    );

    if (ownsClient) await client.query('COMMIT');
    return rows.length > 0;
  } catch (err) {
    if (ownsClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownsClient) client.release();
  }
}

export { CODE_OFFER_MODES };
