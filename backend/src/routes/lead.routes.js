import express from 'express';
import leadController from '../controllers/lead.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/preview', leadController.preview.bind(leadController));

/**
 * GET /api/leads/export — tải Excel theo bộ lọc (đặt trước `/` để không bị nhầm path).
 */
router.get('/export', leadController.exportXlsx.bind(leadController));

/**
 * GET /api/leads — danh sách lead landing (phân trang + lọc). Đặt sau /preview để không đụng path.
 */
router.get('/', leadController.list.bind(leadController));

export default router;
