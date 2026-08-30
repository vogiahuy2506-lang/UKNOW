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
         SET status = 'success', paid_at = NOW(), updated_at = NOW()
         WHERE order_code = $1
           AND status NOT IN ('success', 'cancelled', 'failed')
         RETURNING id, user_id, plan_id, user_email, billing_period,
                   amount, voucher_id, voucher_code, discount_amount,
                   note, topup_config, invoice_info, custom_plan_config, order_code, payment_method,
                   paid_at`,
        [orderCode]
    );
    return rows[0] || null;
};

/**
 * Serialize paid-plan fulfillment for one account.
 *
 * Keep this statement deliberately limited to the row lock. PostgreSQL takes
 * a statement snapshot before a `SELECT ... FOR UPDATE` waits; combining this
 * lock with a read of `orders` would therefore miss a newer checkout committed
 * while this statement was waiting. Call
 * `findNewerSuccessfulPlanEntitlement` in a *subsequent* statement instead.
 */
export const lockUserForPaidPlanFulfillment = async ({
    userId,
    queryable = db,
} = {}) => {
    if (!userId) return null;

    const { rows } = await queryable.query(
        `SELECT id, email
           FROM users
          WHERE id = $1
          FOR UPDATE`,
        [userId]
    );
    return rows[0] || null;
};

/**
 * Return the later successful entitlement that beats a direct checkout.
 *
 * Must run only after the caller acquired `lockUserForPaidPlanFulfillment` in
 * the same transaction. Keeping this as a second statement gives Read
 * Committed a fresh snapshot after any wait on the user row.
 */
export const findNewerSuccessfulPlanEntitlement = async ({
    userId,
    orderId,
    queryable = db,
} = {}) => {
    if (!userId || !orderId) return null;

    const { rows } = await queryable.query(
        `WITH target_user AS (
           SELECT id, email
           FROM users
           WHERE id = $1
         ), newer AS (
           SELECT o.id, o.order_code, o.plan_id
           FROM orders o
           JOIN target_user u ON TRUE
           WHERE o.id > $2
             AND o.plan_id IS NOT NULL
             AND o.status IN ('paid', 'success', 'completed')
             AND o.topup_config IS NULL
             AND o.note IS DISTINCT FROM 'topup'
             AND o.note IS DISTINCT FROM 'scheduled_change'
             AND (
               o.user_id = u.id
               OR (
                 o.user_id IS NULL
                 AND LOWER(o.user_email) = LOWER(u.email)
               )
             )

           UNION ALL

           -- A paid scheduled checkout becomes an entitlement only when its
           -- matching change is activated. Pending scheduled changes must not
           -- block a direct activation before the current plan expires.
           SELECT scheduled_order.id, scheduled_order.order_code, spc.plan_id
           FROM scheduled_plan_changes spc
           JOIN target_user u ON u.id = spc.user_id
           JOIN orders scheduled_order ON scheduled_order.id = spc.order_id
           WHERE spc.status = 'activated'
             AND spc.order_id > $2
             AND scheduled_order.plan_id = spc.plan_id
             AND scheduled_order.status IN ('paid', 'success', 'completed')
             AND scheduled_order.topup_config IS NULL
             AND scheduled_order.note = 'scheduled_change'
         )
         SELECT id AS newer_successful_order_id,
                order_code AS newer_successful_order_code,
                plan_id AS newer_successful_plan_id
         FROM newer
         ORDER BY id DESC
         LIMIT 1`,
        [userId, orderId]
    );
    return rows[0] || null;
};

/**
 * Return any newer paid plan checkout for a scheduled entitlement. Unlike the
 * direct-order guard, a newer *pending* scheduled change is relevant here: an
 * older webhook must not supersede the customer's later scheduled checkout.
 */
export const findNewerSuccessfulPlanCheckout = async ({
    userId,
    orderId,
    queryable = db,
} = {}) => {
    if (!userId || !orderId) return null;

    const { rows } = await queryable.query(
        `SELECT o.id AS newer_successful_order_id,
                o.order_code AS newer_successful_order_code,
                o.plan_id AS newer_successful_plan_id,
                o.note AS newer_successful_order_note
           FROM orders o
           JOIN users u ON u.id = $1
          WHERE o.id > $2
            AND o.plan_id IS NOT NULL
            AND o.status IN ('paid', 'success', 'completed')
            AND o.topup_config IS NULL
            AND o.note IS DISTINCT FROM 'topup'
            AND (
              o.user_id = u.id
              OR (
                o.user_id IS NULL
                AND LOWER(o.user_email) = LOWER(u.email)
              )
            )
          ORDER BY o.id DESC
          LIMIT 1`,
        [userId, orderId]
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
 * Recent pending plan checkouts that a new checkout for the same target would
 * replace. Callers use these IDs only as temporary voucher reservations to
 * ignore; the rows stay pending until the replacement PayOS link exists.
 */
export const findRecentPendingPlanOrders = async ({
    userId = null,
    userEmail = null,
    planId,
    billingPeriod = 'monthly',
    withinMinutes = 13,
    queryable = db,
} = {}) => {
    const minutes = Math.max(1, Number(withinMinutes) || 13);
    const { rows } = await queryable.query(
        `SELECT id, order_code
         FROM orders
         WHERE status = 'pending'
           AND COALESCE(payment_method, 'payos') = 'payos'
           AND plan_id = $1
           AND billing_period = $2
           AND COALESCE(note, '') <> 'topup'
           AND topup_config IS NULL
           AND created_at >= NOW() - ($3 || ' minutes')::interval
           AND (
             ($4::bigint IS NOT NULL AND user_id = $4)
             OR ($5::text IS NOT NULL AND user_id IS NULL AND LOWER(user_email) = LOWER($5))
           )
         ORDER BY id ASC`,
        [planId, billingPeriod, String(minutes), userId, userEmail]
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
    olderThanOrderId = null,
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
           AND ($7::bigint IS NULL OR id < $7)
           AND (
             ($4::bigint IS NOT NULL AND user_id = $4)
             OR ($6::text IS NOT NULL AND user_id IS NULL AND LOWER(user_email) = LOWER($6))
           )
         RETURNING order_code, id`,
        [planId, billingPeriod, String(minutes), userId, reason, userEmail, olderThanOrderId]
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
    olderThanOrderId = null,
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
           AND ($4::bigint IS NULL OR id < $4)
         RETURNING order_code, id`,
        [userId, reason, String(minutes), olderThanOrderId]
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
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email]
    );
    return rows[0]?.id || null;
};

export const hasSuccessfulOrderForPlanByUser = async ({ planId, userId = null, userEmail = null, queryable = db }) => {
    const { rows } = await queryable.query(
        `SELECT 1
         FROM orders
         WHERE plan_id = $1
           AND status = 'success'
           AND (
             ($2::bigint IS NOT NULL AND user_id = $2)
             OR (
               $3::text IS NOT NULL
               AND user_id IS NULL
               AND LOWER(user_email) = LOWER($3)
             )
           )
         LIMIT 1`,
        [planId, userId, userEmail]
    );
    return rows.length > 0;
};

// billingPeriod: 'monthly' → theo duration_days của plan, 'yearly' → +12 tháng
export const activateUserPlan = async (userId, planId, billingPeriod = 'monthly', queryable = db) => {
    const { rows } = await queryable.query(
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
         WHERE p.id = $1 AND u.id = $2
         RETURNING u.active_plan_id, u.subscription_expires_at, u.plan_activated_at`,
        [planId, userId, billingPeriod]
    );
    const activation = rows[0] || null;
    if (!activation) {
        throw new Error(`Không thể kích hoạt gói ${planId} cho tài khoản ${userId}: không tìm thấy user hoặc plan.`);
    }
    return activation;
};
