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
import { requireSelfContext } from '../middleware/authorization.middleware.js';
import { webhookLimiter, paymentStatusLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

router.get('/scheduled-change', authMiddleware, requireSelfContext, getScheduledPlanChange);
router.post('/resolve-change', optionalAuthMiddleware, resolvePlanChangePreview);

router.post('/create-payment', authMiddleware, requireSelfContext, createPayment);
router.post('/create-custom-payment', authMiddleware, requireSelfContext, createCustomPayment);
router.post('/activate-free', authMiddleware, requireSelfContext, activateFree);
router.post('/webhook', webhookLimiter, webhook);
router.post('/einvoice/webhook/:secret', webhookLimiter, einvoiceWebhook);
router.get('/invoice/:orderCode', authMiddleware, requireSelfContext, getInvoiceForOrder);
router.get('/invoice/:orderCode/pdf', authMiddleware, requireSelfContext, downloadInvoicePdf);
// Status is status-only (no PII). Auth optional so PayOS returnUrl works without SPA token;
// when authenticated, ownership is still enforced. Rate-limited against probing — bucket riêng
// paymentStatusLimiter (PR-7), không dùng chung publicLeadLimiter: CheckoutPage hỏi mỗi 3 giây
// suốt thời hạn QR (mặc định 15 phút) sẽ vượt trần 25 lần/15 phút của publicLeadLimiter.
router.get('/status/:orderCode', paymentStatusLimiter, optionalAuthMiddleware, getPaymentStatus);

export default router;
