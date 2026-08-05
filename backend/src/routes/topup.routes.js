import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { getConfig, quote, createPayment } from '../controllers/topup.controller.js';

const router = Router();

router.get('/config', authMiddleware, getConfig);
router.post('/quote', authMiddleware, quote);
router.post('/create-payment', authMiddleware, createPayment);

export default router;
