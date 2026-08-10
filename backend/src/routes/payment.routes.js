import { Router } from 'express';
import {
  activateFree,
  createPayment,
  createCustomPayment,
  getPaymentStatus,
  webhook,
  einvoiceWebhook,
  getInvoiceForOrder,
} from '../controllers/payment.controller.js';
import authMiddleware, { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { webhookLimiter, publicLeadLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.post('/create-payment', authMiddleware, createPayment);
router.post('/create-custom-payment', authMiddleware, createCustomPayment);
router.post('/activate-free', authMiddleware, activateFree);
router.post('/webhook', webhookLimiter, webhook);
router.post('/einvoice/webhook/:secret', webhookLimiter, einvoiceWebhook);
router.get('/invoice/:orderCode', authMiddleware, getInvoiceForOrder);
// Status is status-only (no PII). Auth optional so PayOS returnUrl works without SPA token;
// when authenticated, ownership is still enforced. Rate-limited against probing.
router.get('/status/:orderCode', publicLeadLimiter, optionalAuthMiddleware, getPaymentStatus);

export default router;
