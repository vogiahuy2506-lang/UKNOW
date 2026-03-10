import express from 'express';
import { body } from 'express-validator';
import handleValidationErrors from '../middleware/validate.middleware.js';
import authMiddleware from '../middleware/auth.middleware.js';
import CampaignScheduleController from '../controllers/campaignSchedule.controller.js';

const router = express.Router();
const controller = new CampaignScheduleController();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get all schedules
router.get('/', controller.getAll.bind(controller));

// Get schedule by ID
router.get('/:id', controller.getById.bind(controller));

// Create new schedule
router.post(
  '/',
  [
    body('campaignId').isInt({ min: 1 }).withMessage('Campaign ID phải là số nguyên dương'),
    body('scheduleName').trim().notEmpty().withMessage('Tên lịch không được để trống'),
    body('scheduleType').isIn(['once', 'daily', 'weekly', 'monthly', 'custom']).withMessage('Loại lịch không hợp lệ'),
    body('cronExpression').trim().notEmpty().withMessage('Cron expression không được để trống'),
    body('enabled').optional().isBoolean().withMessage('Enabled phải là boolean'),
    handleValidationErrors,
  ],
  controller.create.bind(controller)
);

// Update schedule
router.patch(
  '/:id',
  [
    body('scheduleName').optional().trim().notEmpty().withMessage('Tên lịch không được để trống'),
    body('scheduleType').optional().isIn(['once', 'daily', 'weekly', 'monthly', 'custom']).withMessage('Loại lịch không hợp lệ'),
    body('cronExpression').optional().trim().notEmpty().withMessage('Cron expression không được để trống'),
    body('enabled').optional().isBoolean().withMessage('Enabled phải là boolean'),
    handleValidationErrors,
  ],
  controller.update.bind(controller)
);

// Delete schedule
router.delete('/:id', controller.delete.bind(controller));

export default router;
