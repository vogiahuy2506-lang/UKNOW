import db from '../../config/database.js';

// Public pricing — chỉ lấy gói đại trà còn active. Custom plan (is_custom=true) không bao
// giờ hiện trên trang pricing công khai vì chúng được tạo riêng cho từng khách hàng.

export const findPlanByCode = async (code) => {
    const { rows } = await db.query(
        'SELECT * FROM plans WHERE code = $1 AND is_active = true AND is_custom = false',
        [code]
    );
    return rows[0] || null;
};

export const findAllPlans = async () => {
    const { rows } = await db.query(
        'SELECT * FROM plans WHERE is_active = true AND is_custom = false ORDER BY price ASC'
    );
    return rows;
};
