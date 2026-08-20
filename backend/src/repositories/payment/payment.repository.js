import db from '../../config/database.js';

export const deleteOrderByCode = async (orderCode) => {
    await db.query('DELETE FROM orders WHERE order_code = $1', [orderCode]);
};

export const createOrder = async ({
    orderCode,
    planId,
    amount,
    userEmail,
    userId = null,
    status = 'pending',
    paymentMethod = 'payos',
    note = null,
    billingPeriod = 'monthly',
    originalAmount = null,
    discountAmount = 0,
    voucherId = null,
    voucherCode = null,
    discountSource = null,
    discountLabel = null,
    topupConfig = null,
    invoiceInfo = null,
    customPlanConfig = null,
}, queryable = db) => {
    const { rows } = await queryable.query(
        `INSERT INTO orders (
            order_code, plan_id, amount, user_email, user_id, status, payment_method, note, billing_period,
            original_amount, discount_amount, voucher_id, voucher_code, discount_source, discount_label,
            topup_config, invoice_info, custom_plan_config, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()) RETURNING *`,
        [
            orderCode,
            planId,
            amount,
            userEmail,
            userId,
            status,
            paymentMethod,
            note,
            billingPeriod,
            originalAmount ?? amount,
            discountAmount || 0,
            voucherId,
            voucherCode,
            discountSource,
            discountLabel,
            topupConfig ? JSON.stringify(topupConfig) : null,
            invoiceInfo ? JSON.stringify(invoiceInfo) : null,
            customPlanConfig ? JSON.stringify(customPlanConfig) : null,
        ]
    );
    return rows[0];
};

export const updateOrderStatus = async (orderCode, status) => {
    await db.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_code = $2',
        [status, orderCode]
    );
};

/**
 * Atomically mark order success — only if not already success/cancelled/failed.
 * @param {number|string} orderCode
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<object|null>}
 */
export const claimOrderSuccess = async (orderCode, queryable = db) => {
    const { rows } = await queryable.query(
        `UPDATE orders
         SET status = 'success', updated_at = NOW()
         WHERE order_code = $1
           AND status NOT IN ('success', 'cancelled', 'failed')
         RETURNING id, user_id, plan_id, user_email, billing_period,
                   amount, voucher_id, voucher_code, discount_amount,
                   note, topup_config, invoice_info, custom_plan_config, order_code, payment_method`,
        [orderCode]
    );
    return rows[0] || null;
};

/**
 * Mark order failed for manual ops review (amount mismatch, etc.).
 * Does not activate plan. Idempotent for already-terminal rows.
 */
export const markOrderFailedForReview = async (orderCode, note, queryable = db) => {
    const { rows } = await queryable.query(
        `UPDATE orders
            SET status = 'failed',
                note = CASE
                  WHEN note IS NULL OR note = '' THEN $2
                  ELSE note || E'\\n' || $2
                END,
                updated_at = NOW()
          WHERE order_code = $1
            AND status NOT IN ('success', 'cancelled')
          RETURNING id, order_code, amount, status`,
        [orderCode, note]
    );
    return rows[0] || null;
};

export const findOrderStatusByCode = async (orderCode) => {
    const { rows } = await db.query(
        'SELECT status, user_id, user_email FROM orders WHERE order_code = $1',
        [orderCode]
    );
    return rows[0] || null;
};

export const findOrderByCode = async (orderCode, queryable = db) => {
    const { rows } = await queryable.query(
        `SELECT id, order_code, user_id, plan_id, status, user_email, billing_period,
                amount, voucher_id, voucher_code, discount_amount, note, topup_config,
                invoice_info, custom_plan_config, payment_method, created_at
         FROM orders WHERE order_code = $1`,
        [orderCode]
    );
    return rows[0] || null;
};

/**
 * Pending payos orders created within the last `withinHours` hours.
 * @param {number} withinHours
 * @returns {Promise<object[]>}
 */
export const findPendingPayosOrdersSinceHours = async (withinHours = 48) => {
    const hours = Math.max(1, Number(withinHours) || 48);
    const { rows } = await db.query(
        `SELECT id, order_code, user_id, plan_id, status, user_email, billing_period,
                amount, voucher_id, voucher_code, discount_amount, note, topup_config,
                invoice_info, custom_plan_config, payment_method, created_at
         FROM orders
         WHERE status = 'pending'
           AND COALESCE(payment_method, 'payos') = 'payos'
           AND created_at >= NOW() - ($1 || ' hours')::interval
         ORDER BY created_at ASC`,
        [String(hours)]
    );
    return rows;
};

/**
 * Pending payos orders older than `olderThanHours`.
 * @param {number} olderThanHours
 */
export const findStalePendingPayosOrders = async (olderThanHours = 72) => {
    const hours = Math.max(1, Number(olderThanHours) || 72);
    const { rows } = await db.query(
        `SELECT id, order_code, user_id, plan_id, status, user_email, billing_period,
                amount, voucher_id, voucher_code, discount_amount, note, topup_config,
                invoice_info, custom_plan_config, payment_method, created_at
         FROM orders
         WHERE status = 'pending'
           AND COALESCE(payment_method, 'payos') = 'payos'
           AND created_at < NOW() - ($1 || ' hours')::interval
         ORDER BY created_at ASC
         LIMIT 200`,
        [String(hours)]
    );
    return rows;
};

/**
 * Cancel pending plan checkout duplicates for the same user/plan/period.
 * @returns {Promise<object[]>} cancelled rows
 */
export const cancelRecentPendingPlanOrders = async ({
    userId = null,
    userEmail = null,
    planId,
    billingPeriod = 'monthly',
    withinMinutes = 13,
    reason = '[OPS] Replaced by newer checkout attempt',
    queryable = db,
} = {}) => {
    const minutes = Math.max(1, Number(withinMinutes) || 13);
    const { rows } = await queryable.query(
        `UPDATE orders
         SET status = 'cancelled',
             note = CASE
               WHEN note IS NULL OR note = '' THEN $5
               ELSE note || E'\\n' || $5
             END,
             updated_at = NOW()
         WHERE status = 'pending'
           AND COALESCE(payment_method, 'payos') = 'payos'
           AND plan_id = $1
           AND billing_period = $2
           AND COALESCE(note, '') <> 'topup'
           AND topup_config IS NULL
           AND created_at >= NOW() - ($3 || ' minutes')::interval
           AND (
             ($4::bigint IS NOT NULL AND user_id = $4)
             OR ($6::text IS NOT NULL AND LOWER(user_email) = LOWER($6))
           )
         RETURNING order_code, id`,
        [planId, billingPeriod, String(minutes), userId, reason, userEmail]
    );
    return rows;
};

/**
 * Cancel recent pending top-up orders for the same user.
 */
export const cancelRecentPendingTopupOrders = async ({
    userId,
    withinMinutes = 13,
    reason = '[OPS] Replaced by newer top-up checkout attempt',
    queryable = db,
} = {}) => {
    if (!userId) return [];
    const minutes = Math.max(1, Number(withinMinutes) || 13);
    const { rows } = await queryable.query(
        `UPDATE orders
         SET status = 'cancelled',
             note = CASE
               WHEN note IS NULL OR note = '' THEN $2
               ELSE note || E'\\n' || $2
             END,
             updated_at = NOW()
         WHERE status = 'pending'
           AND COALESCE(payment_method, 'payos') = 'payos'
           AND user_id = $1
           AND (note = 'topup' OR topup_config IS NOT NULL)
           AND created_at >= NOW() - ($3 || ' minutes')::interval
         RETURNING order_code, id`,
        [userId, reason, String(minutes)]
    );
    return rows;
};

export const cancelPendingOrderWithNote = async (orderCode, note, queryable = db) => {
    const { rows } = await queryable.query(
        `UPDATE orders
         SET status = 'cancelled',
             note = CASE
               WHEN note IS NULL OR note = '' THEN $2
               ELSE note || E'\\n' || $2
             END,
             updated_at = NOW()
         WHERE order_code = $1
           AND status = 'pending'
         RETURNING id, order_code, status`,
        [orderCode, note]
    );
    return rows[0] || null;
};

export const findUserIdByEmail = async (email) => {
    const { rows } = await db.query(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [email]
    );
    return rows[0]?.id || null;
};

export const hasSuccessfulOrderForPlanByUser = async ({ planId, userId = null, userEmail = null }) => {
    const { rows } = await db.query(
        `SELECT 1
         FROM orders
         WHERE plan_id = $1
           AND status = 'success'
           AND (
             ($2::bigint IS NOT NULL AND user_id = $2)
             OR ($3::text IS NOT NULL AND LOWER(user_email) = LOWER($3))
           )
         LIMIT 1`,
        [planId, userId, userEmail]
    );
    return rows.length > 0;
};

// billingPeriod: 'monthly' → theo duration_days của plan, 'yearly' → +12 tháng
export const activateUserPlan = async (userId, planId, billingPeriod = 'monthly', queryable = db) => {
    await queryable.query(
        `UPDATE users u
         SET active_plan_id = p.id,
             subscription_expires_at = NOW() + (CASE WHEN $3 = 'yearly' THEN INTERVAL '12 months' ELSE (COALESCE(p.duration_days, 30) || ' days')::INTERVAL END),
             plan_activated_at = NOW(),
             subscription_reminder_count = 0,
             max_landing_pages        = p.max_landing_pages,
             max_campaigns            = p.max_campaigns,
             max_zalo_campaigns       = p.max_zalo_campaigns,
             max_zalo_group_campaigns = p.max_zalo_group_campaigns,
             max_email_campaigns      = p.max_email_campaigns,
             max_zalo_accounts        = p.max_zalo_accounts,
             max_email_accounts       = p.max_email_accounts,
             max_email_templates      = p.max_email_templates,
             max_zalo_templates       = p.max_zalo_templates,
             messages_per_period      = p.messages_per_period,
             is_fup_enabled           = p.is_fup_enabled,
             updated_at = CURRENT_TIMESTAMP
         FROM plans p
         WHERE p.id = $1 AND u.id = $2`,
        [planId, userId, billingPeriod]
    );
};
