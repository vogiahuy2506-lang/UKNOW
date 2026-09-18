import express from 'express';
import { body } from 'express-validator';
import marketplaceSellerController from '../controllers/marketplaceSeller.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { requirePermission } from '../middleware/authorization.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePermission('marketplace_manage'));

// Dashboard
router.get('/dashboard', marketplaceSellerController.getDashboard.bind(marketplaceSellerController));

// Listings với stats
router.get('/listings', marketplaceSellerController.getMyListings.bind(marketplaceSellerController));
router.get('/listings/:id', marketplaceSellerController.getListingStats.bind(marketplaceSellerController));

// Earnings
router.get('/earnings', marketplaceSellerController.getEarnings.bind(marketplaceSellerController));

// Withdrawals
router.get('/withdrawals', marketplaceSellerController.getWithdrawals.bind(marketplaceSellerController));
router.post('/withdraw',
  [
    body('amount').isInt({ min: 1 }).withMessage('Số tiền phải lớn hơn 0'),
  ],
  handleValidationErrors,
  marketplaceSellerController.requestWithdrawal.bind(marketplaceSellerController)
);

export default router;
