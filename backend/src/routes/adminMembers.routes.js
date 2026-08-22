import express from 'express';
import { param, body } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as ctrl from '../controllers/admin/adminMembers.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', ctrl.list);

router.patch('/:id/status',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  ctrl.toggleStatus
);

router.patch('/:id/role',
  [
    param('id').isInt({ min: 1 }),
    body('role').isIn(['user', 'admin']),
  ],
  handleValidationErrors,
  ctrl.updateRole
);

router.patch('/:id/promote',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  ctrl.promote
);

router.patch('/:id/demote',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  ctrl.demote
);

// Mức 1 — giải phóng email/username, giữ nguyên dữ liệu (đơn hàng, hoá đơn...)
router.patch('/:id/detach-email',
  [
    param('id').isInt({ min: 1 }),
    body('confirmEmail').trim().isEmail().withMessage('confirmEmail phải là email hợp lệ'),
  ],
  handleValidationErrors,
  ctrl.detachEmail
);

// Mức 2 — xoá cứng, chỉ cho tài khoản không có đơn hàng/marketplace
router.delete('/:id/purge',
  [
    param('id').isInt({ min: 1 }),
    body('confirmEmail').trim().isEmail().withMessage('confirmEmail phải là email hợp lệ'),
  ],
  handleValidationErrors,
  ctrl.purge
);

export default router;
