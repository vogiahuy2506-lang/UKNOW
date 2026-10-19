import express from 'express';
import founderaiController from '../controllers/founderai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import {
  requireActivePlan,
  requirePasswordChange,
  requirePhone,
  requirePermission,
} from '../middleware/authorization.middleware.js';
import { requirePlatformStoreOwner } from '../middleware/platformStoreOwner.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);

// Khách + đơn Founder AI dùng khoá WooCommerce của NỀN TẢNG (PII người mua founderai.biz): chỉ workspace của super admin
// (`requirePlatformStoreOwner` xét role CHỦ workspace, nhân viên của workspace đó vẫn qua). Khoá học là danh mục công khai
// nên `/courses` và `/sync/courses` giữ nguyên.

// Get customers from Founder AI
router.get('/customers', requirePermission('customers'), requirePlatformStoreOwner, founderaiController.getCustomers.bind(founderaiController));

// Get courses from Founder AI
router.get('/courses', requirePermission('courses'), founderaiController.getCourses.bind(founderaiController));

// Get orders from Founder AI
router.get('/orders', requirePermission('customers'), requirePlatformStoreOwner, founderaiController.getOrders.bind(founderaiController));

// Lấy thông tin một đơn hàng cụ thể từ Founder AI (on-hold = quan tâm, completed = đã đặt thành công)
router.get('/orders/:orderId', requirePermission('customers'), requirePlatformStoreOwner, founderaiController.getOrder.bind(founderaiController));

// Sync customers from Founder AI
router.post('/sync/customers', requirePermission('customers'), requirePlatformStoreOwner, founderaiController.syncCustomers.bind(founderaiController));

// Sync courses from Founder AI
router.post('/sync/courses', requirePermission('courses'), founderaiController.syncCourses.bind(founderaiController));

// Sync orders from Founder AI
router.post('/sync/orders', requirePermission('customers'), requirePlatformStoreOwner, founderaiController.syncOrders.bind(founderaiController));

// Đồng bộ trạng thái một đơn hàng cụ thể từ Founder AI vào DB nội bộ
router.post('/sync/orders/:orderId', requirePermission('customers'), requirePlatformStoreOwner, founderaiController.syncOrder.bind(founderaiController));

export default router;
