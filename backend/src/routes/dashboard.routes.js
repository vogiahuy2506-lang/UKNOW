import express from 'express';
import dashboardController, { validateDashboardInsightsPayload } from '../controllers/dashboard.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import { requirePermission, requireSelfContext } from '../middleware/authorization.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Thống kê landing page (view/click/submit theo slug) — cùng bộ lọc ngày với dashboard
router.get(
  '/landing-pages-stats',
  requirePermission('reports_view'),
  dashboardController.getLandingPageStats.bind(dashboardController)
);

// Get overview
router.get('/overview', requirePermission('reports_view'), dashboardController.getOverview.bind(dashboardController));

// Get analytics (đã gửi mỗi ngày + đơn hàng theo ngày)
router.get('/analytics', requirePermission('reports_view'), dashboardController.getAnalytics.bind(dashboardController));

// Get orders list
router.get('/orders', requireSelfContext, dashboardController.getOrdersList.bind(dashboardController));

// Bảng "Chiến dịch trong kỳ" (đã gửi / chưa gửi được / mở / nhấp / đã mua theo chiến dịch)
router.get('/campaigns', requirePermission('reports_view'), dashboardController.getCampaigns.bind(dashboardController));

// Insight đã lưu (JSON trên DB) — đặt trước route POST /insights để không nhầm path
router.get('/insights/saved', requirePermission('reports_view'), dashboardController.getSavedInsights.bind(dashboardController));

// Generate Gemini insights for dashboard (thành công + payload hợp lệ thì ghi đè DB)
router.post(
  '/insights',
  requirePermission('reports_view'),
  validateDashboardInsightsPayload,
  assertAiCreditAvailable('dashboard_insights'),
  dashboardController.generateInsights.bind(dashboardController)
);

export default router;
