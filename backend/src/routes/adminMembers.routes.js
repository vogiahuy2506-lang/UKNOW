import express from 'express';
import { param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as ctrl from '../controllers/admin/adminMembers.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('super_admin'));

router.get('/', ctrl.list);

router.patch('/:id/status',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  ctrl.toggleStatus
);

router.patch('/:id/promote',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  ctrl.promote
);

export default router;
