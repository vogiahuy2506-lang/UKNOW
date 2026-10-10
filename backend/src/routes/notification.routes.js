import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/notification.controller.js';

const router = express.Router();

// Chuông thông báo + tuỳ chọn email: CHỈ authMiddleware.
//  - KHÔNG requireActivePlan: gói hết hạn vẫn phải thấy thông báo thanh toán / hết hạn.
//  - KHÔNG requirePermission: nhân viên không có khoá quyền nào cho việc này, và dòng in-app gắn theo id NGƯỜI thao tác.
router.use(authMiddleware);

/** GET /api/notifications?page&limit&unread=1 → { items, unreadCount, pagination } */
router.get('/', ctrl.list);
/** GET /api/notifications/unread-count → { unreadCount } */
router.get('/unread-count', ctrl.unreadCount);
/** GET /api/notifications/preferences → tuỳ chọn theo catalog audience='user' */
router.get('/preferences', ctrl.getPreferences);
/** PUT /api/notifications/preferences { eventType, emailEnabled } */
router.put('/preferences', ctrl.updatePreference);
/** POST /api/notifications/read-all */
router.post('/read-all', ctrl.markAllRead);
/** POST /api/notifications/:id/read */
router.post('/:id/read', ctrl.markRead);

export default router;
