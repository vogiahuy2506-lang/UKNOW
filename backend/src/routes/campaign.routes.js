import express from 'express';
import { body } from 'express-validator';
import campaignController from '../controllers/campaign.controller.js';
import uknowController from '../controllers/uknow.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();
const CAMPAIGN_TYPE_OPTIONS = ['email', 'zalo', 'zalo_group', 'mixed'];

router.use(authMiddleware);

// Get all
router.get('/', campaignController.getAll.bind(campaignController));

// Get by id
router.get('/:id', campaignController.getById.bind(campaignController));

// Create
router.post('/',
  [
    body('campaignName').trim().notEmpty().withMessage('Tên chiến dịch không được để trống'),
    body('campaignType').isIn(CAMPAIGN_TYPE_OPTIONS).withMessage('Loại chiến dịch không hợp lệ')
  ],
  handleValidationErrors,
  campaignController.create.bind(campaignController)
);

// Update
router.put('/:id',
  [
    body('campaignName').optional().trim().notEmpty().withMessage('Tên chiến dịch không được để trống'),
    body('campaignType').optional().isIn(CAMPAIGN_TYPE_OPTIONS).withMessage('Loại chiến dịch không hợp lệ')
  ],
  handleValidationErrors,
  campaignController.update.bind(campaignController)
);

// Delete
router.delete('/:id', campaignController.delete.bind(campaignController));

// Publish
router.post('/:id/publish', campaignController.publish.bind(campaignController));

// Pause
router.post('/:id/pause', campaignController.pause.bind(campaignController));

// Run campaign
router.post('/:id/run', campaignController.run.bind(campaignController));

// Duplicate
router.post('/:id/duplicate',
  [
    body('campaignName').trim().notEmpty().withMessage('Tên chiến dịch không được để trống')
  ],
  handleValidationErrors,
  campaignController.duplicate.bind(campaignController)
);

// Đồng bộ trạng thái khách hàng từ UKNOW cho chiến dịch cụ thể
router.post('/:id/sync-uknow', uknowController.syncCampaignUknow.bind(uknowController));

export default router;
