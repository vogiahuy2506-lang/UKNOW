import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireActivePlan } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import * as employeeController from '../controllers/employee.controller.js';

const router = express.Router();

// Tất cả routes yêu cầu đăng nhập.
// Chỉ super_admin và user_admin mới quản lý được nhân viên.
router.use(authMiddleware);
router.use(requireRole('admin', 'user'));

// GET /api/employees
router.get('/', employeeController.getEmployees);

// GET /api/employees/:id
router.get(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ')],
  handleValidationErrors,
  employeeController.getEmployee
);

// POST /api/employees — tạo tài khoản employee mới và gửi email mời (cần có plan)
router.post(
  '/',
  requireActivePlan,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Tên đăng nhập phải từ 3-50 ký tự')
      .matches(/^[A-Za-z0-9]+$/)
      .withMessage('Tên đăng nhập chỉ được chứa chữ cái và số'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
    body('fullName')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không quá 255 ký tự'),
  ],
  handleValidationErrors,
  employeeController.createEmployee
);

// POST /api/employees/:id/resend-invite — gửi lại email mời kích hoạt
router.post(
  '/:id/resend-invite',
  [param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ')],
  handleValidationErrors,
  employeeController.resendInvite
);

// POST /api/employees/link — link tài khoản người dùng có sẵn thành nhân viên (cần owner có plan)
router.post(
  '/link',
  requireActivePlan,
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
  ],
  handleValidationErrors,
  employeeController.linkEmployee
);

// PATCH /api/employees/:id — cập nhật thông tin cơ bản (họ tên, email)
router.patch(
  '/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ'),
    body('email')
      .optional({ checkFalsy: true })
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
    body('fullName')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không quá 255 ký tự'),
  ],
  handleValidationErrors,
  employeeController.updateInfo
);

// PATCH /api/employees/:id/limits — cập nhật giới hạn lượt gửi email/zalo
router.patch(
  '/:id/limits',
  [
    param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ'),
    body('dailyEmailLimit').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Giới hạn email/ngày phải là số >= 0'),
    body('monthlyEmailLimit').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Giới hạn email/tháng phải là số >= 0'),
    body('dailyZaloLimit').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Giới hạn zalo/ngày phải là số >= 0'),
    body('monthlyZaloLimit').optional({ nullable: true }).isInt({ min: 0 }).withMessage('Giới hạn zalo/tháng phải là số >= 0'),
  ],
  handleValidationErrors,
  employeeController.updateLimits
);

// PATCH /api/employees/:id/permissions
router.patch(
  '/:id/permissions',
  [
    param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ'),
    body('permissions').isObject().withMessage('permissions phải là object'),
  ],
  handleValidationErrors,
  employeeController.updatePermissions
);

// PATCH /api/employees/:id/status
router.patch(
  '/:id/status',
  [
    param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ'),
    body('status')
      .isIn(['active', 'inactive'])
      .withMessage('status phải là active hoặc inactive'),
  ],
  handleValidationErrors,
  employeeController.updateStatus
);

// PATCH /api/employees/:id/reset-password
router.patch(
  '/:id/reset-password',
  [param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ')],
  handleValidationErrors,
  employeeController.resetEmployeePassword
);

// DELETE /api/employees/:id
router.delete(
  '/:id',
  [param('id').isInt({ min: 1 }).withMessage('ID nhân viên không hợp lệ')],
  handleValidationErrors,
  employeeController.deleteEmployee
);

export default router;
