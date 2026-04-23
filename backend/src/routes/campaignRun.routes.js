import express from 'express';
import campaignRunController from '../controllers/campaignRun.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Tất cả routes đều yêu cầu xác thực
router.use(authMiddleware);

// GET /api/campaign-runs - Lấy danh sách lịch sử chạy
router.get('/', campaignRunController.getAll.bind(campaignRunController));

// GET /api/campaign-runs/:id - Lấy chi tiết một lịch sử chạy
router.get('/:id', campaignRunController.getById.bind(campaignRunController));

// POST /api/campaign-runs/:id/stop - Dừng một lượt chạy đang thực thi
router.post('/:id/stop', campaignRunController.stopById.bind(campaignRunController));

export default router;
