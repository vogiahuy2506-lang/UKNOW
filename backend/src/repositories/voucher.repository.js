import db from '../config/database.js';

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
  stackable,
  is_active AS "isActive",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

export const normalizeVoucherCode = (code) => String(code || '').trim().toUpperCase();

export async function findAdminVouchers() {
  const { rows } = await db.query(`
    SELECT ${VOUCHER_SELECT}
    FROM vouchers
    ORDER BY created_at DESC, id DESC
  `);
  return rows;
}

export async function createVoucher(payload) {
  const { rows } = await db.query(
    `INSERT INTO vouchers (
       code, name, description, discount_type, discount_value, max_discount_amount,
       min_order_amount, applies_to_plan_codes, applies_to_billing_periods,
       starts_at, ends_at, usage_limit, usage_limit_per_user,
       auto_apply, stackable, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
      payload.autoApply,
      payload.stackable,
      payload.isActive,
    ]
  );
  return rows[0];
}

export async function updateVoucher(id, payload) {
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
           stackable = $16,
           is_active = $17,
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
      payload.autoApply,
      payload.stackable,
      payload.isActive,
    ]
  );
  return rows[0] || null;
}

export async function deleteVoucher(id) {
  const { rowCount } = await db.query('DELETE FROM vouchers WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function findEligibleVouchers({
  code = null,
  autoOnly = false,
  manualOnly = false,
  ignoreMinOrder = false,
  planCode,
  billingPeriod,
  amount,
  userId = null,
  userEmail = null,
}) {
  const params = [
    code ? normalizeVoucherCode(code) : null,
    Boolean(autoOnly),
    Boolean(manualOnly),
    String(planCode || '').trim().toLowerCase(),
    String(billingPeriod || 'monthly').trim().toLowerCase(),
    Number(amount || 0),
    userId,
    userEmail ? String(userEmail).trim().toLowerCase() : null,
    Boolean(ignoreMinOrder),
  ];

  const { rows } = await db.query(
    `SELECT ${VOUCHER_SELECT}
     FROM vouchers v
     WHERE v.is_active = TRUE
       AND ($1::text IS NULL OR UPPER(v.code) = $1)
       AND ($2::boolean = FALSE OR v.auto_apply = TRUE)
       AND ($3::boolean = FALSE OR v.auto_apply = FALSE)
       AND (v.starts_at IS NULL OR v.starts_at <= NOW())
       AND (v.ends_at IS NULL OR v.ends_at >= NOW())
       AND ($9::boolean = TRUE OR v.min_order_amount <= $6)
       AND (v.usage_limit IS NULL OR v.used_count < v.usage_limit)
       AND (
         v.applies_to_plan_codes IS NULL
         OR cardinality(v.applies_to_plan_codes) = 0
         OR EXISTS (SELECT 1 FROM unnest(v.applies_to_plan_codes) AS plan_code WHERE LOWER(plan_code) = $4)
       )
       AND (
         v.applies_to_billing_periods IS NULL
         OR cardinality(v.applies_to_billing_periods) = 0
         OR EXISTS (SELECT 1 FROM unnest(v.applies_to_billing_periods) AS period WHERE LOWER(period) = $5)
       )
       AND (
         v.usage_limit_per_user IS NULL
         OR v.usage_limit_per_user = 0
         OR (
           SELECT COUNT(*)::int
           FROM voucher_redemptions r
           WHERE r.voucher_id = v.id
             AND (
               ($7::bigint IS NOT NULL AND r.user_id = $7)
               OR ($8::text IS NOT NULL AND LOWER(r.user_email) = $8)
             )
         ) < v.usage_limit_per_user
       )
     ORDER BY v.auto_apply DESC, v.created_at DESC`,
    params
  );
  return rows;
}

export async function redeemVoucherForOrder(order) {
  if (!order?.voucher_id || Number(order.discount_amount || 0) <= 0) return false;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
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
    await client.query('COMMIT');
    return rows.length > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
