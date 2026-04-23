import express from 'express';
import { body } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import zaloTemplateController from '../controllers/zaloTemplate.controller.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/zalo-templates
 * Purpose: Lấy danh sách template Zalo theo user hiện tại (có hỗ trợ filter category/search).
 * Response: { success, data: { items, pagination } }
 */
router.get('/', zaloTemplateController.getAll.bind(zaloTemplateController));

/**
 * GET /api/zalo-templates/:id
 * Purpose: Lấy chi tiết một template Zalo theo ID.
 * Params: { id }
 * Response: { success, data }
 */
router.get('/:id', zaloTemplateController.getById.bind(zaloTemplateController));

/**
 * POST /api/zalo-templates
 * Purpose: Tạo template Zalo mới.
 * Body: { templateName, subject, bodyText, ... }
 * Response: { success, message, data }
 */
router.post(
  '/',
  [
    body('templateName').trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').trim().notEmpty().withMessage('Tiêu đề không được để trống'),
    body('bodyText')
      .custom((value) => typeof value === 'string' && value.trim().length > 0)
      .withMessage('Nội dung text không được để trống'),
  ],
  handleValidationErrors,
  zaloTemplateController.create.bind(zaloTemplateController)
);

/**
 * PUT /api/zalo-templates/:id
 * Purpose: Cập nhật template Zalo.
 * Params: { id }
 * Body: { templateName?, subject?, bodyText?, ... }
 * Response: { success, message, data }
 */
router.put(
  '/:id',
  [
    body('templateName').optional().trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').optional().trim().notEmpty().withMessage('Tiêu đề không được để trống'),
  ],
  handleValidationErrors,
  zaloTemplateController.update.bind(zaloTemplateController)
);

/**
 * DELETE /api/zalo-templates/:id
 * Purpose: Xóa template Zalo theo ID.
 * Params: { id }
 * Response: { success, message }
 */
router.delete('/:id', zaloTemplateController.delete.bind(zaloTemplateController));

export default router;
