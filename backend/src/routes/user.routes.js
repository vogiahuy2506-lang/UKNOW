import express from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

// All routes require authentication
router.use(authMiddleware);

// Get profile
router.get('/profile', userController.getProfile.bind(userController));

// Lịch sử mua gói dịch vụ của user đang đăng nhập
router.get('/my-orders', userController.getMyOrders.bind(userController));

// Update profile
/**
 * PUT /api/users/profile
 * Mục đích: Người dùng đang đăng nhập cập nhật thông tin tài khoản cá nhân.
 * Input body: { fullName?, email?, phone? }.
 * Response: thông tin profile sau khi cập nhật.
 */
router.put('/profile',
  [
    body('fullName')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không được quá 255 ký tự'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('phone')
      .optional()
      .trim()
      .matches(/^[0-9]{10,11}$/)
      .withMessage('Số điện thoại không hợp lệ'),
  ],
  handleValidationErrors,
  userController.updateProfile.bind(userController)
);

// Change password
router.put('/change-password',
  [
    body('currentPassword')
      .notEmpty()
      .withMessage('Mật khẩu hiện tại không được để trống'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Mật khẩu mới phải có ít nhất 6 ký tự')
  ],
  handleValidationErrors,
  userController.changePassword.bind(userController)
);

/**
 * GET /api/users/employees
 * Mục đích: Admin lấy danh sách tài khoản nhân viên.
 * Input: không có body, yêu cầu Bearer token của admin.
 * Response: danh sách nhân viên gồm thông tin cơ bản + trạng thái tài khoản.
 */
router.get('/employees', requireAdmin, userController.getEmployees.bind(userController));

/**
 * POST /api/users/employees
 * Mục đích: Admin tạo tài khoản nhân viên mới.
 * Input body: { username, email, fullName?, phone? }.
 * Response: thông tin nhân viên vừa tạo (mật khẩu mặc định được hệ thống tự gán).
 */
router.post(
  '/employees',
  requireAdmin,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Tên đăng nhập phải từ 3-50 ký tự')
      .matches(USERNAME_REGEX)
      .withMessage('Tên đăng nhập chỉ được chứa chữ cái không dấu và số (không khoảng trắng, không ký tự đặc biệt)'),
    body('email').trim().isEmail().withMessage('Email không hợp lệ'),
    body('fullName')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không được quá 255 ký tự'),
    body('phone').optional().trim(),
  ],
  handleValidationErrors,
  userController.createEmployee.bind(userController)
);

/**
 * PATCH /api/users/employees/:id/status
 * Mục đích: Admin khóa/mở tài khoản nhân viên.
 * Input body: { status: 'active' | 'inactive' }.
 * Response: id nhân viên + trạng thái mới.
 */
router.patch(
  '/employees/:id/status',
  requireAdmin,
  [
    body('status')
      .trim()
      .isIn(['active', 'inactive'])
      .withMessage('Trạng thái không hợp lệ'),
  ],
  handleValidationErrors,
  userController.updateEmployeeStatus.bind(userController)
);

/**
 * PATCH /api/users/employees/:id/reset-password
 * Mục đích: Admin reset mật khẩu nhân viên về mật khẩu mặc định của hệ thống.
 * Input: param id nhân viên.
 * Response: id nhân viên + thông báo reset thành công.
 */
router.patch(
  '/employees/:id/reset-password',
  requireAdmin,
  userController.resetEmployeePassword.bind(userController)
);

/**
 * PATCH /api/users/employees/:id/limits
 * Mục đích: Admin cập nhật giới hạn tài nguyên cho tài khoản nhân viên.
 * Input body: {
 *   maxCampaigns?,
 *   maxZaloAccounts?,
 *   maxEmailAccounts?,
 *   maxEmailTemplates?,
 *   maxZaloTemplates?,
 *   maxLandingPages?
 * } với giá trị là số nguyên >= 0 hoặc null (null = không giới hạn).
 * Response: id nhân viên + bộ giới hạn sau khi cập nhật.
 */
router.patch(
  '/employees/:id/limits',
  requireAdmin,
  [
    body('maxCampaigns')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Giới hạn số chiến dịch phải là số nguyên lớn hơn hoặc bằng 0'),
    body('maxZaloAccounts')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Giới hạn số tài khoản Zalo phải là số nguyên lớn hơn hoặc bằng 0'),
    body('maxEmailAccounts')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Giới hạn số tài khoản email phải là số nguyên lớn hơn hoặc bằng 0'),
    body('maxEmailTemplates')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Giới hạn số email template phải là số nguyên lớn hơn hoặc bằng 0'),
    body('maxZaloTemplates')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Giới hạn số Zalo template phải là số nguyên lớn hơn hoặc bằng 0'),
    body('maxLandingPages')
      .optional({ nullable: true })
      .isInt({ min: 0 })
      .withMessage('Giới hạn số landing page phải là số nguyên lớn hơn hoặc bằng 0'),
  ],
  handleValidationErrors,
  userController.updateEmployeeLimits.bind(userController)
);

export default router;
