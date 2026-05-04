import db from '../../config/database.js';

// Tạo đơn mua mới
export const createOrder = async ({ orderCode, planId, amount, userEmail, userId = null, status = 'pending' }) => {
    const { rows } = await db.query(
        `INSERT INTO orders (order_code, plan_id, amount, user_email, user_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
        [orderCode, planId, amount, userEmail, userId, status]
    );
    return rows[0];
};

// Cập nhật trạng thái đơn hàng
export const updateOrderStatus = async (orderCode, status) => {
    await db.query(
        'UPDATE orders SET status = $1, updated_at = NOW() WHERE order_code = $2',
        [status, orderCode]
    );
};

// Tìm trạng thái đơn hàng theo orderCode
export const findOrderStatusByCode = async (orderCode) => {
    const { rows } = await db.query(
        'SELECT status FROM orders WHERE order_code = $1',
        [orderCode]
    );
    return rows[0] || null;
};

// Lấy user_id và plan_id từ order để cập nhật active_plan sau khi thanh toán thành công
export const findOrderByCode = async (orderCode) => {
    const { rows } = await db.query(
        'SELECT id, user_id, plan_id, status FROM orders WHERE order_code = $1',
        [orderCode]
    );
    return rows[0] || null;
};

// Cập nhật active_plan_id + subscription_expires_at sau khi thanh toán thành công.
// Nếu user còn thời hạn cũ chưa hết → gia hạn từ ngày hết hạn cũ (không mất ngày).
export const activateUserPlan = async (userId, planId) => {
    await db.query(
        `UPDATE users
         SET active_plan_id = $1,
             subscription_expires_at = CASE
               WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
                 THEN subscription_expires_at + INTERVAL '1 month'
               ELSE NOW() + INTERVAL '1 month'
             END,
             subscription_reminder_count = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [planId, userId]
    );
};