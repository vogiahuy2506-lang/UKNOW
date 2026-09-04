import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/authorization.middleware.js';
import * as affiliateWithdrawalController from '../controllers/affiliateWithdrawal.controller.js';

const affiliateWithdrawalRouter = express.Router();
const adminAffiliateWithdrawalRouter = express.Router();

// ─── User Routes ─────────────────────────────────────────────────────────────
affiliateWithdrawalRouter.post(
  '/',
  authMiddleware,
  affiliateWithdrawalController.requestWithdrawal
);

affiliateWithdrawalRouter.get(
  '/prefill',
  authMiddleware,
  affiliateWithdrawalController.getPrefill
);

affiliateWithdrawalRouter.get(
  '/my',
  authMiddleware,
  affiliateWithdrawalController.getMyWithdrawals
);

// ─── Admin Routes ────────────────────────────────────────────────────────────
adminAffiliateWithdrawalRouter.get(
  '/',
  authMiddleware,
  requireAdmin,
  affiliateWithdrawalController.adminList
);

adminAffiliateWithdrawalRouter.post(
  '/:id/pay',
  authMiddleware,
  requireAdmin,
  affiliateWithdrawalController.adminApprove
);

adminAffiliateWithdrawalRouter.post(
  '/:id/reject',
  authMiddleware,
  requireAdmin,
  affiliateWithdrawalController.adminReject
);

export { affiliateWithdrawalRouter, adminAffiliateWithdrawalRouter };
export default affiliateWithdrawalRouter;
