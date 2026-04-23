import express from 'express';
import dashboardController from '../controllers/dashboard.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Thống kê landing page (view/click/submit theo slug) — cùng bộ lọc ngày với dashboard
router.get(
  '/landing-pages-stats',
  dashboardController.getLandingPageStats.bind(dashboardController)
);

// Get overview
router.get('/overview', dashboardController.getOverview.bind(dashboardController));

// Get analytics
router.get('/analytics', dashboardController.getAnalytics.bind(dashboardController));

// Get run-level analytics
router.get('/runs', dashboardController.getRuns.bind(dashboardController));

// Get orders list
router.get('/orders', dashboardController.getOrdersList.bind(dashboardController));

// Get top lists (top courses by orders, top campaigns by orders/clicks)
router.get('/top-lists', dashboardController.getTopLists.bind(dashboardController));

// Compare campaigns
router.get('/compare', dashboardController.compareCampaigns.bind(dashboardController));

// Insight đã lưu (JSON trên DB) — đặt trước route POST /insights để không nhầm path
router.get('/insights/saved', dashboardController.getSavedInsights.bind(dashboardController));

// Generate Gemini insights for dashboard (thành công + payload hợp lệ thì ghi đè DB)
router.post('/insights', dashboardController.generateInsights.bind(dashboardController));

export default router;
