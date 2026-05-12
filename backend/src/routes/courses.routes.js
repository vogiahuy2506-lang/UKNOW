import express from 'express';
import coursesController from '../controllers/courses.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Tất cả các routes đều yêu cầu xác thực
router.use(authMiddleware);

// Đồng bộ khóa học từ Founder AI (thủ công)
router.post('/sync', coursesController.syncManual.bind(coursesController));

// Lấy danh sách khóa học (có phân trang và tìm kiếm)
router.get('/', coursesController.getAll.bind(coursesController));

// Lấy thông tin một khóa học theo ID
router.get('/:id', coursesController.getById.bind(coursesController));

export default router;
