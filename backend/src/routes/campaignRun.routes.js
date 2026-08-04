import express from 'express';
import campaignRunController from '../controllers/campaignRun.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';

const router = express.Router();

// Tất cả routes đều yêu cầu xác thực + quyền campaigns_run
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// GET /api/campaign-runs - Lấy danh sách lịch sử chạy
router.get('/', requirePermission('campaigns_view'), campaignRunController.getAll.bind(campaignRunController));

// GET /api/campaign-runs/:id - Lấy chi tiết một lịch sử chạy
router.get('/:id', requirePermission('campaigns_view'), campaignRunController.getById.bind(campaignRunController));

// POST /api/campaign-runs/:id/stop - Dừng một lượt chạy đang thực thi
router.post('/:id/stop', requirePermission('campaigns_run'), campaignRunController.stopById.bind(campaignRunController));

export default router;
