import { Router } from "express";
import { getPlans, getCustomPlanConfig, quoteCustomPlan, getMyCustomPlan } from '../controllers/plan.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', getPlans);
router.get('/custom/mine', authMiddleware, getMyCustomPlan);
router.get('/custom/config', authMiddleware, getCustomPlanConfig);
router.post('/custom/quote', authMiddleware, quoteCustomPlan);

export default router;
