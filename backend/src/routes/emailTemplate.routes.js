import express from 'express';
import { body } from 'express-validator';
import emailTemplateController from '../controllers/emailTemplate.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Get all
router.get('/', emailTemplateController.getAll.bind(emailTemplateController));

// Get by id
router.get('/:id', emailTemplateController.getById.bind(emailTemplateController));

// Create
router.post('/',
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

// Update
router.put('/:id',
  [
    body('templateName').optional().trim().notEmpty().withMessage('Tên mẫu không được để trống'),
    body('subject').optional().trim().notEmpty().withMessage('Tiêu đề không được để trống')
  ],
  handleValidationErrors,
  emailTemplateController.update.bind(emailTemplateController)
);

// Delete
router.delete('/:id', emailTemplateController.delete.bind(emailTemplateController));

export default router;
