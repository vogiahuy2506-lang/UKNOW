import db from '../../config/database.js';

// Tạo đơn mua mới
export const createOrder = async ({ orderCode, planId, amount, userEmail, status = 'pending' }) => {
    const { rows } = await db.query(
        `INSERT INTO orders (order_code, plan_id, amount, user_email, status, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [orderCode, planId, amount, userEmail, status]
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