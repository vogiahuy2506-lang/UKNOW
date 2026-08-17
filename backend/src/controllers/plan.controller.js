import * as planService from '../services/payment/plan.service.js';
import * as customPlanService from '../services/payment/customPlan.service.js';

export const getPlans = async (req, res) => {
    try {
        const plans = await planService.getAllPlans();
        res.json({ success: true, plans });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

export const getCustomPlanConfig = async (req, res) => {
    try {
        const data = await customPlanService.getCustomPlanPricingConfig();
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
    }
};

export const quoteCustomPlan = async (req, res) => {
    try {
        const { quantities = {}, billingPeriod = 'monthly' } = req.body || {};
        const data = await customPlanService.quoteCustomPlan({ quantities, billingPeriod });
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({
            success: false,
            message: err.message || 'Lỗi server',
            code: err.code,
            errors: err.errors,
            capacity: err.capacity,
        });
    }
};

export const getMyCustomPlan = async (req, res) => {
    try {
        if (req.user?.activeContext?.type === 'employee') {
            return res.json({ success: true, data: null });
        }
        const userId = req.user.id;
        const activePlanId = req.user.active_plan_id || req.user.activePlanId;
        const data = await customPlanService.getMyCustomPlan({ userId, activePlanId });
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
    }
};
