import express from 'express';
import { body } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as controller from '../controllers/admin/systemEmailTemplate.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

const templateValidators = [
  body('subject').isString().isLength({ min: 1, max: 200 })
    .withMessage('Tiêu đề email phải có từ 1 đến 200 ký tự'),
  body('bodyHtml').isString().isLength({ min: 1, max: 100000 })
    .withMessage('Nội dung email phải có từ 1 đến 100000 ký tự'),
];

router.get('/welcome', controller.getWelcomeTemplate);
router.put('/welcome', templateValidators, handleValidationErrors, controller.updateWelcomeTemplate);
router.delete('/welcome', controller.resetWelcomeTemplate);
router.post('/welcome/preview', templateValidators, handleValidationErrors, controller.previewWelcomeTemplate);

export default router;

