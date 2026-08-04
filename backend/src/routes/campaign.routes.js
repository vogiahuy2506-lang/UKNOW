import express from 'express';
import { body } from 'express-validator';
import campaignController from '../controllers/campaign.controller.js';
import founderaiController from '../controllers/founderai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';

const router = express.Router();
const CAMPAIGN_TYPE_OPTIONS = ['email', 'zalo', 'zalo_group', 'mixed'];

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Get all — chỉ cần quyền xem
router.get('/', requirePermission('campaigns_view'), campaignController.getAll.bind(campaignController));

router.get('/delay-config', requirePermission('campaigns_view'), campaignController.getDelayConfig.bind(campaignController));

// Get by id — chỉ cần quyền xem
router.get('/:id', requirePermission('campaigns_view'), campaignController.getById.bind(campaignController));

// Create — cần quyền tạo
router.post('/',
  requirePermission('campaigns_create'),
  [
    body('campaignName').trim().notEmpty().withMessage('Tên chiến dịch không được để trống'),
    body('campaignType').isIn(CAMPAIGN_TYPE_OPTIONS).withMessage('Loại chiến dịch không hợp lệ')
  ],
  handleValidationErrors,
  campaignController.create.bind(campaignController)
);

// Update — cần quyền tạo
router.put('/:id',
  requirePermission('campaigns_create'),
  [
    body('campaignName').optional().trim().notEmpty().withMessage('Tên chiến dịch không được để trống'),
    body('campaignType').optional().isIn(CAMPAIGN_TYPE_OPTIONS).withMessage('Loại chiến dịch không hợp lệ')
  ],
  handleValidationErrors,
  campaignController.update.bind(campaignController)
);

// Delete — cần quyền tạo
router.delete('/:id', requirePermission('campaigns_create'), campaignController.delete.bind(campaignController));

// Publish — cần quyền chạy
router.post('/:id/publish', requirePermission('campaigns_run'), campaignController.publish.bind(campaignController));

// Pause
router.post('/:id/pause', requirePermission('campaigns_run'), campaignController.pause.bind(campaignController));

// Run campaign — cần quyền chạy
router.post('/:id/run', requirePermission('campaigns_run'), campaignController.run.bind(campaignController));

// Duplicate — cần quyền tạo
router.post('/:id/duplicate',
  requirePermission('campaigns_create'),
  [
    body('campaignName').trim().notEmpty().withMessage('Tên chiến dịch không được để trống')
  ],
  handleValidationErrors,
  campaignController.duplicate.bind(campaignController)
);

// Đồng bộ trạng thái khách hàng từ Founder AI cho chiến dịch cụ thể
router.post('/:id/sync-founderai', requirePermission('campaigns_view'), founderaiController.syncCampaignUknow.bind(founderaiController));

export default router;
