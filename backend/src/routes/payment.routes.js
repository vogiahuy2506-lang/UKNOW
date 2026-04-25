import { Router } from 'express';
import { createPayment, getPaymentStatus, webhook } from '../controllers/payment.controller.js';

const router = Router();

router.post('/create-payment', createPayment);
router.post('/webhook', webhook);
router.get('/status/:orderCode', getPaymentStatus);

export default router;