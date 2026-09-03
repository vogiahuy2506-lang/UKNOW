import express from 'express';
import { body } from 'express-validator';
import zaloTemplateController from '../controllers/zaloTemplate.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange, requirePhone } from '../middleware/authorization.middleware.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { getStoragePaths } from '../utils/storageCapacity.util.js';

const router = express.Router();
const hasTempAttachments = (req) => Array.isArray(req.body?.tempAttachments)
  && req.body.tempAttachments.some((attachment) => attachment?.tempId && attachment?.originalName);
const workspacePromotionCapacityGuard = storageCapacityGuard({
  paths: [getStoragePaths().uploads],
  shouldCheck: hasTempAttachments,
});
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);
router.use(requirePermission('zalo_templates'));

// Get all — chỉ cần auth
router.get('/', zaloTemplateController.getAll.bind(zaloTemplateController));

// Get by id — chỉ cần auth
router.get('/:id', zaloTemplateController.getById.bind(zaloTemplateController));

// Create — cần quyền zalo_templates
router.post('/',
  requirePermission('zalo_templates'),
  workspacePromotionCapacityGuard,
  [
    body('templateName').trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').optional({ checkFalsy: true }).trim(),
    body('bodyText')
      .custom((value) => typeof value === 'string' && value.trim().length > 0)
      .withMessage('Nội dung text không được để trống'),
  ],
  handleValidationErrors,
  zaloTemplateController.create.bind(zaloTemplateController)
);

// Update — cần quyền zalo_templates
router.put(
  '/:id',
  requirePermission('zalo_templates'),
  workspacePromotionCapacityGuard,
  [
    body('templateName').optional().trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').optional({ checkFalsy: true }).trim().notEmpty().withMessage('Tiêu đề không được để trống'),
  ],
  handleValidationErrors,
  zaloTemplateController.update.bind(zaloTemplateController)
);

// Delete — cần quyền zalo_templates
router.delete('/:id', requirePermission('zalo_templates'), zaloTemplateController.delete.bind(zaloTemplateController));

export default router;
