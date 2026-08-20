import { Router } from 'express';
import {
  activateFree,
  createPayment,
  createCustomPayment,
  getPaymentStatus,
  webhook,
  einvoiceWebhook,
  getInvoiceForOrder,
  downloadInvoicePdf,
  resolvePlanChangePreview,
} from '../controllers/payment.controller.js';
import {
  getScheduledPlanChange,
} from '../controllers/scheduledPlanChange.controller.js';
import authMiddleware, { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { webhookLimiter, publicLeadLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.get('/scheduled-change', authMiddleware, getScheduledPlanChange);
router.post('/resolve-change', optionalAuthMiddleware, resolvePlanChangePreview);

router.post('/create-payment', authMiddleware, createPayment);
router.post('/create-custom-payment', authMiddleware, createCustomPayment);
router.post('/activate-free', authMiddleware, activateFree);
router.post('/webhook', webhookLimiter, webhook);
router.post('/einvoice/webhook/:secret', webhookLimiter, einvoiceWebhook);
router.get('/invoice/:orderCode', authMiddleware, getInvoiceForOrder);
router.get('/invoice/:orderCode/pdf', authMiddleware, downloadInvoicePdf);
// Status is status-only (no PII). Auth optional so PayOS returnUrl works without SPA token;
// when authenticated, ownership is still enforced. Rate-limited against probing.
router.get('/status/:orderCode', publicLeadLimiter, optionalAuthMiddleware, getPaymentStatus);

export default router;
