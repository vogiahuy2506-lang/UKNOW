import express from 'express';
import founderaiController from '../controllers/founderai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import {
  requireActivePlan,
  requirePasswordChange,
  requirePermission,
} from '../middleware/authorization.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Get customers from Founder AI
router.get('/customers', requirePermission('customers'), founderaiController.getCustomers.bind(founderaiController));

// Get courses from Founder AI
router.get('/courses', requirePermission('courses'), founderaiController.getCourses.bind(founderaiController));

// Get orders from Founder AI
router.get('/orders', requirePermission('customers'), founderaiController.getOrders.bind(founderaiController));

// Lấy thông tin một đơn hàng cụ thể từ Founder AI (on-hold = quan tâm, completed = đã đặt thành công)
router.get('/orders/:orderId', requirePermission('customers'), founderaiController.getOrder.bind(founderaiController));

// Sync customers from Founder AI
router.post('/sync/customers', requirePermission('customers'), founderaiController.syncCustomers.bind(founderaiController));

// Sync courses from Founder AI
router.post('/sync/courses', requirePermission('courses'), founderaiController.syncCourses.bind(founderaiController));

// Sync orders from Founder AI
router.post('/sync/orders', requirePermission('customers'), founderaiController.syncOrders.bind(founderaiController));

// Đồng bộ trạng thái một đơn hàng cụ thể từ Founder AI vào DB nội bộ
router.post('/sync/orders/:orderId', requirePermission('customers'), founderaiController.syncOrder.bind(founderaiController));

export default router;
