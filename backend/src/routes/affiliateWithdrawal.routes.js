import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/authorization.middleware.js';
import * as affiliateWithdrawalController from '../controllers/affiliateWithdrawal.controller.js';

const affiliateWithdrawalRouter = express.Router();
const adminAffiliateWithdrawalRouter = express.Router();

const affiliateRouter = express.Router();
const adminAffiliateRouter = express.Router();

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

// Mount overview and withdrawals on user affiliateRouter
affiliateRouter.get(
  '/overview',
  authMiddleware,
  affiliateWithdrawalController.getOverview
);
affiliateRouter.use('/withdrawals', affiliateWithdrawalRouter);

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

// Mount withdrawals, periods, and adjustment on adminAffiliateRouter
adminAffiliateRouter.use('/withdrawals', adminAffiliateWithdrawalRouter);

adminAffiliateRouter.get(
  '/periods',
  authMiddleware,
  requireAdmin,
  affiliateWithdrawalController.adminListPeriods
);

adminAffiliateRouter.get(
  '/available-months',
  authMiddleware,
  requireAdmin,
  affiliateWithdrawalController.adminListAvailableMonths
);

adminAffiliateRouter.post(
  '/ledger-adjustment',
  authMiddleware,
  requireAdmin,
  affiliateWithdrawalController.adminLedgerAdjustment
);

export {
  affiliateWithdrawalRouter,
  adminAffiliateWithdrawalRouter,
  affiliateRouter,
  adminAffiliateRouter,
};
export default affiliateRouter;

