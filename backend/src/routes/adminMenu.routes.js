import express from 'express';
import { body } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as controller from '../controllers/admin/adminMenu.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', controller.getLayout);
router.put(
  '/',
  [body('categories').isArray({ min: 1, max: 30 }).withMessage('Danh sách chuyên mục không hợp lệ')],
  handleValidationErrors,
  controller.updateLayout
);

router.get('/app', controller.getAppLayout);
router.put(
  '/app',
  [body('categories').isArray({ min: 1, max: 30 }).withMessage('Danh sách chuyên mục không hợp lệ')],
  handleValidationErrors,
  controller.updateAppLayout
);

export default router;
