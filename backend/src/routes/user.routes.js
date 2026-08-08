import express from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin, requireSelfContext } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();
// All routes require authentication
router.use(authMiddleware);

// Get profile
router.get('/profile', userController.getProfile.bind(userController));

// Lịch sử mua gói dịch vụ của user đang đăng nhập
router.get('/my-orders', userController.getMyOrders.bind(userController));

/**
 * PATCH /api/users/bot-daily-reply-cap
 * Chủ tài khoản đặt trần lượt bot trả lời mỗi ngày (null/empty = bỏ giới hạn).
 */
router.patch(
  '/bot-daily-reply-cap',
  requireSelfContext,
  [
    body('botDailyReplyCap')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || String(value).trim() === '') return true;
        const n = Number.parseInt(String(value), 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Giới hạn phải là số nguyên dương, hoặc để trống để bỏ giới hạn');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  userController.updateBotDailyReplyCap.bind(userController)
);

/**
 * PATCH /api/users/ai-handoff-auto-resume
 * Chủ tài khoản đặt phút tự bật lại AI sau handoff (null = tắt / bật tay).
 */
router.patch(
  '/ai-handoff-auto-resume',
  requireSelfContext,
  [
    body('aiHandoffAutoResumeMinutes')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || String(value).trim() === '') return true;
        const n = Number.parseInt(String(value), 10);
        if (![5, 15, 30, 60].includes(n)) {
          throw new Error('Giá trị phải là 5, 15, 30, 60 phút, hoặc để trống để tắt');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  userController.updateAiHandoffAutoResume.bind(userController)
);

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
      .withMessage('Email không hợp lệ'),
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
      .isLength({ min: 8 })
      .withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Mật khẩu mới phải chứa ít nhất một chữ cái và một số')
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
