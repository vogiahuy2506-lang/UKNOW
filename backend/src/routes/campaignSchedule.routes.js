import express from 'express';
import { body } from 'express-validator';
import handleValidationErrors from '../middleware/validate.middleware.js';
import authMiddleware from '../middleware/auth.middleware.js';
import CampaignScheduleController from '../controllers/campaignSchedule.controller.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';

const router = express.Router();
const controller = new CampaignScheduleController();

// Apply auth middleware to all routes
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Get all — cần quyền campaigns_view
router.get('/', requirePermission('campaigns_view'), controller.getAll.bind(controller));

// Get schedule by ID — cần quyền campaigns_view
router.get('/:id', requirePermission('campaigns_view'), controller.getById.bind(controller));

// Create new schedule — cần quyền campaigns_create
router.post(
  '/',
  requirePermission('campaigns_create'),
  [
    body('campaignId').isInt({ min: 1 }).withMessage('Campaign ID phải là số nguyên dương'),
    body('scheduleName').trim().notEmpty().withMessage('Tên lịch không được để trống'),
    body('scheduleType').isIn(['once', 'daily', 'weekly', 'monthly', 'custom']).withMessage('Loại lịch không hợp lệ'),
    body('cronExpression').trim().notEmpty().withMessage('Cron expression không được để trống'),
    body('enabled').optional().isBoolean().toBoolean().withMessage('Enabled phải là boolean'),
    handleValidationErrors,
  ],
  controller.create.bind(controller)
);

// Update schedule — cần quyền campaigns_create
router.patch(
  '/:id',
  requirePermission('campaigns_create'),
  [
    body('scheduleName').optional().trim().notEmpty().withMessage('Tên lịch không được để trống'),
    body('scheduleType').optional().isIn(['once', 'daily', 'weekly', 'monthly', 'custom']).withMessage('Loại lịch không hợp lệ'),
    body('cronExpression').optional().trim().notEmpty().withMessage('Cron expression không được để trống'),
    body('enabled').optional().isBoolean().toBoolean().withMessage('Enabled phải là boolean'),
    handleValidationErrors,
  ],
  controller.update.bind(controller)
);

// Delete schedule — cần quyền campaigns_create
router.delete('/:id', requirePermission('campaigns_create'), controller.delete.bind(controller));

export default router;
