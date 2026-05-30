import { Router } from 'express';
import { activateFree, createPayment, getPaymentStatus, webhook } from '../controllers/payment.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = Router();

router.post('/create-payment', authMiddleware, createPayment);
router.post('/activate-free', authMiddleware, activateFree);
router.post('/webhook', webhook);
router.get('/status/:orderCode', getPaymentStatus);

export default router;
