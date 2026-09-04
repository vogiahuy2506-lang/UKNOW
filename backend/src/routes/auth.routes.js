import express from 'express';
import { body } from 'express-validator';
import authController from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

// Đăng ký
router.post('/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Tên đăng nhập phải từ 3-50 ký tự')
      .matches(USERNAME_REGEX)
      .withMessage('Tên đăng nhập chỉ được chứa chữ cái không dấu và số (không khoảng trắng, không ký tự đặc biệt)'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Mật khẩu phải chứa ít nhất một chữ cái và một số'),
    body('fullName')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không được quá 255 ký tự'),
    // Không kiểm định dạng ở đây — khách gõ/copy "+84 912 345 678", "0912-345-678"
    // đều hợp lệ. Chuẩn hoá + kiểm độ dài (10-11 số) nằm trong controller, dùng
    // normalizePhoneForZaloCampaign — MỘT nguồn sự thật duy nhất cho chuẩn hoá SĐT
    // (đừng thêm regex định dạng ở đây, sẽ lệch với controller — xem PLAN_SDT_BAT_BUOC_SYNC_SHEET
    // mục "Bẫy #1"). PUT /users/me/phone (user.routes.js) đã dùng đúng mẫu này.
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Vui lòng nhập số điện thoại')
  ],
  handleValidationErrors,
  authController.register.bind(authController)
);

// Đăng nhập
router.post('/login',
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Tên đăng nhập không được để trống'),
    body('password')
      .notEmpty()
      .withMessage('Mật khẩu không được để trống')
  ],
  handleValidationErrors,
  authController.login.bind(authController)
);

// Đăng nhập Google
router.post('/google-login',
  [
    body().custom((payload) => {
      const hasCredential = typeof payload?.credential === 'string' && payload.credential.trim();
      const hasAccessToken = typeof payload?.access_token === 'string' && payload.access_token.trim();
      if (!hasCredential && !hasAccessToken) {
        throw new Error('Credential hoặc access token không được để trống');
      }
      return true;
    })
  ],
  handleValidationErrors,
  authController.googleLogin.bind(authController)
);

// Refresh token — đọc từ cookie, không cần body
router.post('/refresh-token', authController.refreshToken.bind(authController));

// Đăng xuất
router.post('/logout', authMiddleware, authController.logout.bind(authController));

// Lấy thông tin user hiện tại
router.get('/me', authMiddleware, authController.getMe.bind(authController));

// Quên mật khẩu — gửi email reset
router.post('/forgot-password',
  [body('email').trim().isEmail().withMessage('Email không hợp lệ')],
  handleValidationErrors,
  authController.forgotPassword.bind(authController)
);

// Đặt lại mật khẩu bằng token từ email
router.post('/reset-password',
  [
    body('token').notEmpty().withMessage('Token không được để trống'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Mật khẩu phải chứa ít nhất một chữ cái và một số'),
  ],
  handleValidationErrors,
  authController.resetPassword.bind(authController)
);

// Kích hoạt tài khoản nhân viên qua link email
router.post('/activate',
  [
    body('token').notEmpty().withMessage('Token không được để trống'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Mật khẩu phải chứa ít nhất một chữ cái và một số'),
  ],
  handleValidationErrors,
  authController.activateAccount.bind(authController)
);

// Đổi mật khẩu khi bị yêu cầu (must_change_password = TRUE)
router.post('/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty().withMessage('Mật khẩu hiện tại không được để trống'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Mật khẩu mới phải chứa ít nhất một chữ cái và một số'),
  ],
  handleValidationErrors,
  authController.changePassword.bind(authController)
);

export default router;
