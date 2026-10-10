import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/admin/notificationEvent.controller.js';

const router = express.Router();

// Super admin (users.role = 'admin') mới cấu hình được sự kiện thông báo hệ thống.
router.use(authMiddleware);
router.use(requireRole('admin'));

/** GET /api/admin/notification-events → catalog + cấu hình hiệu lực */
router.get('/', ctrl.list);
/** PUT /api/admin/notification-events/:eventType { inAppEnabled?, emailEnabled?, userCanDisableEmail? } */
router.put('/:eventType', ctrl.update);

export default router;
