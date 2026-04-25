import db from '../../config/database.js';

export const findPlanByCode = async (code) => {
    const { rows } = await db.query(
        'SELECT * FROM plans WHERE code = $1 AND is_active = true',
        [code]
    );
    return rows[0] || null;
};

export const findAllPlans = async () => {
    const { rows } = await db.query(
        'SELECT * FROM plans WHERE is_active = true ORDER BY price ASC'
    );
    return rows;
};