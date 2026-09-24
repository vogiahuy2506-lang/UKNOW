import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as ctrl from '../controllers/admin/adminAiModels.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', ctrl.list);

router.post('/sync', ctrl.sync);

// Chọn model hệ thống duy nhất (bật model này, tắt tất cả model khác)
router.put(
  '/system-model',
  [body('modelId').optional().isString(), body('model_id').optional().isString()],
  handleValidationErrors,
  ctrl.setSystemModel
);

// Chọn model dự phòng duy nhất (hoặc null để bỏ chọn)
router.put(
  '/fallback-model',
  [
    body('modelId').optional({ nullable: true }).isString(),
    body('model_id').optional({ nullable: true }).isString(),
  ],
  handleValidationErrors,
  ctrl.setFallbackModel
);

router.patch(
  '/:id',
  [
    param('id').trim().notEmpty(),
    body('displayName').optional().isString(),
    body('display_name').optional().isString(),
    body('isEnabled').optional().isBoolean(),
    body('is_enabled').optional().isBoolean(),
  ],
  handleValidationErrors,
  ctrl.update
);

export default router;
