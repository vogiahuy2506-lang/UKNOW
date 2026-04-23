import express from 'express';
import uknowController from '../controllers/uknow.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Get customers from UKNOW
router.get('/customers', uknowController.getCustomers.bind(uknowController));

// Get courses from UKNOW
router.get('/courses', uknowController.getCourses.bind(uknowController));

// Get orders from UKNOW
router.get('/orders', uknowController.getOrders.bind(uknowController));

// Lấy thông tin một đơn hàng cụ thể từ UKNOW (on-hold = quan tâm, completed = đã đặt thành công)
router.get('/orders/:orderId', uknowController.getOrder.bind(uknowController));

// Sync customers from UKNOW
router.post('/sync/customers', uknowController.syncCustomers.bind(uknowController));

// Sync courses from UKNOW
router.post('/sync/courses', uknowController.syncCourses.bind(uknowController));

// Sync orders from UKNOW
router.post('/sync/orders', uknowController.syncOrders.bind(uknowController));

// Đồng bộ trạng thái một đơn hàng cụ thể từ UKNOW vào DB nội bộ
router.post('/sync/orders/:orderId', uknowController.syncOrder.bind(uknowController));

export default router;
