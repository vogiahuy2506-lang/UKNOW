import express from 'express';
import coursesController from '../controllers/courses.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';

const router = express.Router();

// Tất cả các routes đều yêu cầu xác thực + quyền courses
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Đồng bộ khóa học từ Founder AI (thủ công)
router.post('/sync', requirePermission('courses'), coursesController.syncManual.bind(coursesController));

// Lấy danh sách khóa học (có phân trang và tìm kiếm)
router.get('/', requirePermission('courses'), coursesController.getAll.bind(coursesController));

// Lấy thông tin một khóa học theo ID
router.get('/:id', requirePermission('courses'), coursesController.getById.bind(coursesController));

export default router;
