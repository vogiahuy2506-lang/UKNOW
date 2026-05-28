import db from '../../config/database.js';

export const deleteOrderByCode = async (orderCode) => {
    await db.query('DELETE FROM orders WHERE order_code = $1', [orderCode]);
};

export const createOrder = async ({ orderCode, planId, amount, userEmail, userId = null, status = 'pending', paymentMethod = 'payos', note = null, billingPeriod = 'monthly' }) => {
    const { rows } = await db.query(
        `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, payment_method, note, billing_period, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
        [orderCode, planId, amount, userEmail, userId, status, paymentMethod, note, billingPeriod]
    );
    return rows[0];
};

export const updateOrderStatus = async (orderCode, status) => {
    await db.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_code = $2',
        [status, orderCode]
    );
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
        'SELECT id, user_id, plan_id, status, user_email, billing_period FROM orders WHERE order_code = $1',
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
export const activateUserPlan = async (userId, planId, billingPeriod = 'monthly') => {
    await db.query(
        `UPDATE users u
         SET active_plan_id = p.id,
             subscription_expires_at = CASE
               WHEN u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at > NOW()
                 THEN u.subscription_expires_at + (CASE WHEN $3 = 'yearly' THEN INTERVAL '12 months' ELSE (COALESCE(p.duration_days, 30) || ' days')::INTERVAL END)
               ELSE NOW()              + (CASE WHEN $3 = 'yearly' THEN INTERVAL '12 months' ELSE (COALESCE(p.duration_days, 30) || ' days')::INTERVAL END)
             END,
             subscription_reminder_count = 0,
             max_landing_pages   = p.max_landing_pages,
             max_campaigns       = p.max_campaigns,
             max_zalo_accounts   = p.max_zalo_accounts,
             max_email_accounts  = p.max_email_accounts,
             max_email_templates = p.max_email_templates,
             max_zalo_templates  = p.max_zalo_templates,
             updated_at = CURRENT_TIMESTAMP
         FROM plans p
         WHERE p.id = $1 AND u.id = $2`,
        [planId, userId, billingPeriod]
    );
};
