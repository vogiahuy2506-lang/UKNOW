import express from 'express';
import founderaiController from '../controllers/founderai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Get customers from Founder AI
router.get('/customers', founderaiController.getCustomers.bind(founderaiController));

// Get courses from Founder AI
router.get('/courses', founderaiController.getCourses.bind(founderaiController));

// Get orders from Founder AI
router.get('/orders', founderaiController.getOrders.bind(founderaiController));

// Lấy thông tin một đơn hàng cụ thể từ Founder AI (on-hold = quan tâm, completed = đã đặt thành công)
router.get('/orders/:orderId', founderaiController.getOrder.bind(founderaiController));

// Sync customers from Founder AI
router.post('/sync/customers', founderaiController.syncCustomers.bind(founderaiController));

// Sync courses from Founder AI
router.post('/sync/courses', founderaiController.syncCourses.bind(founderaiController));

// Sync orders from Founder AI
router.post('/sync/orders', founderaiController.syncOrders.bind(founderaiController));

// Đồng bộ trạng thái một đơn hàng cụ thể từ Founder AI vào DB nội bộ
router.post('/sync/orders/:orderId', founderaiController.syncOrder.bind(founderaiController));

export default router;
