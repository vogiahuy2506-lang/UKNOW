import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as ctrl from '../controllers/admin/adminPlans.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('super_admin'));

router.get('/', ctrl.list);
router.get('/custom-list', ctrl.listCustom);
router.get('/search-users', ctrl.searchUsers);

router.post('/custom-with-payment',
  [
    body('userEmail').trim().isEmail().withMessage('Email không hợp lệ'),
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    body('price').isInt({ min: 1 }).withMessage('Giá tiền phải lớn hơn 0'),
    body('maxEmployees').optional().isInt({ min: -1 }),
  ],
  handleValidationErrors,
  ctrl.createCustomWithPayment
);

// Đặt trước route /:id để tránh Express parse "custom" như một :id
router.post('/custom',
  [
    body('userEmail').trim().isEmail().withMessage('Email không hợp lệ'),
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    body('price').isInt({ min: 0 }).withMessage('Giá tiền phải >= 0'),
    body('maxEmployees').isInt({ min: -1 }).withMessage('Số nhân viên phải >= -1'),
  ],
  handleValidationErrors,
  ctrl.createCustom
);

router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    body('price').isInt({ min: 0 }).withMessage('Giá tiền phải >= 0'),
    body('maxEmployees').isInt({ min: -1 }).withMessage('Số nhân viên phải >= -1'),
  ],
  handleValidationErrors,
  ctrl.create
);

router.patch('/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    body('price').isInt({ min: 0 }).withMessage('Giá tiền phải >= 0'),
    body('maxEmployees').isInt({ min: -1 }).withMessage('Số nhân viên phải >= -1'),
  ],
  handleValidationErrors,
  ctrl.update
);

router.delete('/:id',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  ctrl.remove
);

// Gán gói trực tiếp cho user cụ thể (bỏ qua thanh toán)
router.post('/:id/assign',
  [
    param('id').isInt({ min: 1 }),
    body('userEmail').trim().isEmail().withMessage('Email không hợp lệ'),
  ],
  handleValidationErrors,
  ctrl.assign
);

export default router;
