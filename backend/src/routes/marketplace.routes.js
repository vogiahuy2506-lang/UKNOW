import express from 'express';
import { body } from 'express-validator';
import marketplaceController from '../controllers/marketplace.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { requirePermission } from '../middleware/authorization.middleware.js';
import { marketplacePurchaseLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Browse & Public endpoints (không cần permission đặc biệt)
router.get('/browse', marketplaceController.browse.bind(marketplaceController));
router.get('/featured', marketplaceController.getFeatured.bind(marketplaceController));
router.get('/categories', marketplaceController.getCategories.bind(marketplaceController));

// My listings management
router.get('/listings', requirePermission('campaigns_view'), marketplaceController.getMyListings.bind(marketplaceController));

router.post('/listings',
  requirePermission('campaigns_create'),
  [
    body('campaignId').notEmpty().withMessage('campaignId là bắt buộc'),
  ],
  handleValidationErrors,
  marketplaceController.create.bind(marketplaceController)
);

router.get('/listings/:id', marketplaceController.getById.bind(marketplaceController));

router.put('/listings/:id',
  requirePermission('campaigns_create'),
  marketplaceController.update.bind(marketplaceController)
);

router.delete('/listings/:id',
  requirePermission('campaigns_create'),
  marketplaceController.delete.bind(marketplaceController)
);

router.post('/listings/:id/publish',
  requirePermission('campaigns_create'),
  marketplaceController.publish.bind(marketplaceController)
);

router.post('/listings/:id/pause',
  requirePermission('campaigns_create'),
  marketplaceController.pause.bind(marketplaceController)
);

// Purchase - với rate limiting
router.post('/purchase/:id', marketplacePurchaseLimiter, marketplaceController.purchase.bind(marketplaceController));
router.get('/purchases', marketplaceController.getMyPurchases.bind(marketplaceController));

// Reviews
router.post('/listings/:id/reviews',
  marketplaceController.createReview.bind(marketplaceController)
);

router.get('/listings/:id/reviews',
  marketplaceController.getReviews.bind(marketplaceController)
);

router.get('/listings/:id/my-review',
  marketplaceController.getMyReview.bind(marketplaceController)
);

// Favorites
router.get('/favorites', marketplaceController.getMyFavorites.bind(marketplaceController));
router.get('/favorites/:id/check', marketplaceController.checkFavorite.bind(marketplaceController));
router.post('/favorites/:id', marketplaceController.addFavorite.bind(marketplaceController));
router.delete('/favorites/:id', marketplaceController.removeFavorite.bind(marketplaceController));

export default router;
