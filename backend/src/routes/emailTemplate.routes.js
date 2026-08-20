import express from 'express';
import { body } from 'express-validator';
import emailTemplateController from '../controllers/emailTemplate.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';
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
router.use(requireActivePlan);
router.use(requirePermission('email_templates'));

// Get all — chỉ cần auth
router.get('/', emailTemplateController.getAll.bind(emailTemplateController));

// Get by id — chỉ cần auth
router.get('/:id', emailTemplateController.getById.bind(emailTemplateController));

// Create — cần quyền email_templates
router.post('/',
  requirePermission('email_templates'),
  workspacePromotionCapacityGuard,
  [
    body('templateName').trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').trim().notEmpty().withMessage('Tiêu đề không được để trống'),
    body('bodyHtml').custom((value, { req }) => {
      const html = typeof value === 'string' ? value.trim() : '';
      const text = typeof req.body.bodyText === 'string' ? req.body.bodyText.trim() : '';
      if (html || text) return true;
      throw new Error('Nội dung HTML hoặc Text không được để trống');
    })
  ],
  handleValidationErrors,
  emailTemplateController.create.bind(emailTemplateController)
);

// Update — cần quyền email_templates
router.put('/:id',
  requirePermission('email_templates'),
  workspacePromotionCapacityGuard,
  [
    body('templateName').optional().trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').optional().trim().notEmpty().withMessage('Tiêu đề không được để trống')
  ],
  handleValidationErrors,
  emailTemplateController.update.bind(emailTemplateController)
);

// Delete — cần quyền email_templates
router.delete('/:id', requirePermission('email_templates'), emailTemplateController.delete.bind(emailTemplateController));

export default router;
