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

export const getUserFeatures = async (userId) => {
    const { rows } = await db.query(
        `SELECT COALESCE(p.features, '[]'::JSONB) as features
         FROM users u
         JOIN plans p ON p.id = u.active_plan_id
         WHERE u.id = $1`,
        [userId]
    );
    
    if (!rows[0]?.features) return [];
    
    const features = rows[0].features;
    if (Array.isArray(features)) return features;
    if (typeof features === 'object') return Object.keys(features).filter(k => features[k]);
    return [];
};

export const getPlanByUserId = async (userId) => {
    const { rows } = await db.query(
        `SELECT p.*
         FROM users u
         JOIN plans p ON p.id = u.active_plan_id
         WHERE u.id = $1`,
        [userId]
    );
    return rows[0] || null;
};
