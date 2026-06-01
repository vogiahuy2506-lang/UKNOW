import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as ctrl from '../controllers/admin/adminPlans.controller.js';

const router = express.Router();

const normalizeMoneyValue = (value) => {
  if (value === '' || value === null || value === undefined) return value;
  if (typeof value === 'number') return value;

  const raw = String(value).trim();
  if (!raw) return raw;

  const compact = raw.replace(/[^\d.,-]/g, '');
  if (!compact || compact === '-') return compact;

  const hasDot = compact.includes('.');
  const hasComma = compact.includes(',');

  if (hasDot && hasComma) {
    const lastDot = compact.lastIndexOf('.');
    const lastComma = compact.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const groupSep = decimalSep === '.' ? ',' : '.';
    const [whole, decimal = ''] = compact.split(decimalSep);
    const normalized = `${whole.replaceAll(groupSep, '')}.${decimal}`;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : value;
  }

  if (hasDot) {
    const parts = compact.split('.');
    const isGrouped = parts.length > 1
      && parts[0].length >= 1
      && parts[0].length <= 3
      && parts.slice(1).every((part) => part.length === 3);
    const parsed = Number(isGrouped ? parts.join('') : compact);
    return Number.isFinite(parsed) ? Math.round(parsed) : value;
  }

  if (hasComma) {
    const parts = compact.split(',');
    const isGrouped = parts.length > 1
      && parts[0].length >= 1
      && parts[0].length <= 3
      && parts.slice(1).every((part) => part.length === 3);
    const parsed = Number(isGrouped ? parts.join('') : compact.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed) : value;
  }

  const parsed = Number(compact);
  return Number.isFinite(parsed) ? Math.round(parsed) : value;
};

const sanitizePlanMoneyFields = () => [
  body('price').customSanitizer(normalizeMoneyValue),
  body('priceYearly').optional({ nullable: true }).customSanitizer(normalizeMoneyValue),
];

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', ctrl.list);
router.get('/custom-list', ctrl.listCustom);
router.get('/search-users', ctrl.searchUsers);

router.post('/custom-with-payment',
  [
    body('userEmail').trim().isEmail().withMessage('Email không hợp lệ'),
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    ...sanitizePlanMoneyFields(),
    body('price').isFloat({ min: 1 }).withMessage('Giá tiền phải lớn hơn 0'),
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
    ...sanitizePlanMoneyFields(),
    body('price').isFloat({ min: 0 }).withMessage('Giá tiền phải >= 0'),
    body('maxEmployees').isInt({ min: -1 }).withMessage('Số nhân viên phải >= -1'),
  ],
  handleValidationErrors,
  ctrl.createCustom
);

router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    ...sanitizePlanMoneyFields(),
    body('price').isFloat({ min: 0 }).withMessage('Giá tiền phải >= 0'),
    body('maxEmployees').isInt({ min: -1 }).withMessage('Số nhân viên phải >= -1'),
  ],
  handleValidationErrors,
  ctrl.create
);

router.patch('/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').trim().notEmpty().withMessage('Tên gói không được để trống'),
    ...sanitizePlanMoneyFields(),
    body('price').isFloat({ min: 0 }).withMessage('Giá tiền phải >= 0'),
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

router.post('/translate-features',
  [body('texts').isArray({ min: 1 }).withMessage('texts phải là mảng không rỗng')],
  handleValidationErrors,
  ctrl.translateFeatures
);

export default router;
