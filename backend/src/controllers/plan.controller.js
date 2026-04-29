import * as planService from '../services/payment/plan.service.js';

export const getPlans = async (req, res) => {
    try {
        const plans = await planService.getAllPlans();
        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};