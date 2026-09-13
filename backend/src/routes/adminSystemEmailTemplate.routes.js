import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as controller from '../controllers/admin/systemEmailTemplate.controller.js';
import { SYSTEM_EMAIL_TEMPLATE_KEYS } from '../services/email/welcomeEmailTemplate.service.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

// PR-2b (13/09/2026, PLAN_CANH_BAO_SAP_HET_HAN_GOI mục 4.2) — '/welcome' cứng đổi thành
// '/:templateKey' có whitelist. SYSTEM_EMAIL_TEMPLATE_KEYS import từ service (nguồn sự thật
// duy nhất, cùng danh sách khoá migration 206 cho phép ở CHECK) — không tự liệt kê lại ở đây,
// đổi thêm khoá ở service thì route tự nhận, không phải sửa hai nơi.
const templateKeyValidator = [
  param('templateKey').isIn(SYSTEM_EMAIL_TEMPLATE_KEYS).withMessage('templateKey không hợp lệ'),
];

const templateBodyValidators = [
  body('subject').isString().isLength({ min: 1, max: 200 })
    .withMessage('Tiêu đề email phải có từ 1 đến 200 ký tự'),
  body('bodyHtml').isString().isLength({ min: 1, max: 100000 })
    .withMessage('Nội dung email phải có từ 1 đến 100000 ký tự'),
];

router.get('/:templateKey', templateKeyValidator, handleValidationErrors, controller.getTemplate);
router.put(
  '/:templateKey',
  templateKeyValidator,
  templateBodyValidators,
  handleValidationErrors,
  controller.updateTemplate
);
router.delete('/:templateKey', templateKeyValidator, handleValidationErrors, controller.resetTemplate);
router.post(
  '/:templateKey/preview',
  templateKeyValidator,
  templateBodyValidators,
  handleValidationErrors,
  controller.previewTemplate
);

export default router;
