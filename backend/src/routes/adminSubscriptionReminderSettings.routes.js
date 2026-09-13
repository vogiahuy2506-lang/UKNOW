import express from 'express';
import { body } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as controller from '../controllers/admin/subscriptionReminderSettings.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.5 — luật hợp lệ chi tiết (1-365, không trùng,
// tối đa 5 mốc) nằm ở subscriptionReminderSettings.service.js (dùng chung với cron), không lặp ở
// đây. Route chỉ chặn shape thô nhất (phải là mảng) để 400 sớm khi body sai kiểu hẳn.
router.get('/', controller.getSettings);
router.put(
  '/',
  body('daysBefore').isArray().withMessage('daysBefore phải là danh sách'),
  handleValidationErrors,
  controller.updateSettings
);

export default router;
