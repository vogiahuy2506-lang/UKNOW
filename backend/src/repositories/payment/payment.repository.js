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
}) => {
    const { rows } = await db.query(
        `INSERT INTO orders (
            order_code, plan_id, amount, user_email, user_id, status, payment_method, note, billing_period,
            original_amount, discount_amount, voucher_id, voucher_code, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) RETURNING *`,
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
 * Atomically mark order success — only if not already success/cancelled.
 * @param {number|string} orderCode
 * @param {import('pg').Pool|import('pg').PoolClient} [queryable]
 * @returns {Promise<object|null>}
 */
export const claimOrderSuccess = async (orderCode, queryable = db) => {
    const { rows } = await queryable.query(
        `UPDATE orders
         SET status = 'success', updated_at = NOW()
         WHERE order_code = $1
           AND status NOT IN ('success', 'cancelled')
         RETURNING id, user_id, plan_id, user_email, billing_period,
                   voucher_id, voucher_code, discount_amount`,
        [orderCode]
    );
    return rows[0] || null;
};

export const findOrderStatusByCode = async (orderCode) => {
    const { rows } = await db.query(
        'SELECT status FROM orders WHERE order_code = $1',
        [orderCode]
    );
    return rows[0] || null;
};

export const findOrderByCode = async (orderCode) => {
    const { rows } = await db.query(
        `SELECT id, user_id, plan_id, status, user_email, billing_period,
                voucher_id, voucher_code, discount_amount
         FROM orders WHERE order_code = $1`,
        [orderCode]
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
             subscription_expires_at = CASE
               WHEN u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > NOW()
                 THEN u.subscription_expires_at + (CASE WHEN $3 = 'yearly' THEN INTERVAL '12 months' ELSE (COALESCE(p.duration_days, 30) || ' days')::INTERVAL END)
               ELSE NOW()              + (CASE WHEN $3 = 'yearly' THEN INTERVAL '12 months' ELSE (COALESCE(p.duration_days, 30) || ' days')::INTERVAL END)
             END,
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
