import express from 'express';
import marketplaceAdminController from '../controllers/marketplaceAdmin.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Admin-only routes - require admin role
router.use(authMiddleware);
router.use((req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Yêu cầu quyền admin',
    });
  }
  next();
});

// Listings management
router.get('/listings', marketplaceAdminController.getAllListings.bind(marketplaceAdminController));
router.put('/listings/:id/status', marketplaceAdminController.updateStatus.bind(marketplaceAdminController));
router.delete('/listings/:id', marketplaceAdminController.deleteListing.bind(marketplaceAdminController));

// Statistics
router.get('/stats', marketplaceAdminController.getStats.bind(marketplaceAdminController));

export default router;
