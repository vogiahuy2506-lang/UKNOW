import express from 'express';
import { body } from 'express-validator';
import authController from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { loginAccountLimiter, loginIpLimiter, authCredentialLimiter, twoFactorVerifyLimiter } from '../middleware/rateLimiter.middleware.js';
import * as twoFactorController from '../controllers/twoFactor.controller.js';
import { requireTrustedAppOrigin } from '../middleware/dynamicCors.middleware.js';

const router = express.Router();
const USERNAME_REGEX = /^[A-Za-z0-9]+$/;

// Đăng ký
router.post('/register',
  authCredentialLimiter,
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
    // đều hợp lệ. Chuẩn hoá + kiểm dạng (di động/số bàn VN, số nước ngoài có +) nằm trong controller, dùng
    // normalizeAccountPhone + isValidAccountPhone (utils/accountPhone.util.js) — MỘT nguồn sự thật cho SĐT tài khoản
    // (đừng thêm regex định dạng ở đây, sẽ lệch với controller — xem PLAN_SDT_BAT_BUOC_SYNC_SHEET
    // mục "Bẫy #1"). PUT /users/me/phone (user.routes.js) đã dùng đúng mẫu này.
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Vui lòng nhập số điện thoại'),
    body('referralCode')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 32 })
      .withMessage('Mã giới thiệu không được quá 32 ký tự'),
    body('inviteToken')
      .optional({ checkFalsy: true })
      .trim()
      .isString(),
    body('consents')
      .custom((value) => {
        if (!value || typeof value !== 'object') {
          throw new Error('Vui lòng đồng ý với các điều khoản và chính sách bắt buộc');
        }
        if (!value.terms || !value.privacy || !value.dpa) {
          throw new Error('Bạn cần đồng ý với Điều khoản dịch vụ, Chính sách bảo mật và Thỏa thuận xử lý dữ liệu để đăng ký');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  authController.register.bind(authController)
);

// Đăng nhập
router.post('/login',
  loginAccountLimiter,
  loginIpLimiter,
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
  loginIpLimiter,
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

// Refresh token — đọc từ cookie, không cần body. Hai route đọc cookie refresh token chỉ nhận request
// từ app tin cậy (requireTrustedAppOrigin: Origin + Sec-Fetch-Site), không nhận từ landing/trang khác.
router.post('/refresh-token', requireTrustedAppOrigin, authController.refreshToken.bind(authController));

// Đăng xuất
router.post('/logout', requireTrustedAppOrigin, authMiddleware, authController.logout.bind(authController));

// Lấy thông tin user hiện tại
router.get('/me', authMiddleware, authController.getMe.bind(authController));

// Cờ tính năng public — KHÔNG authMiddleware, trang đăng ký (chưa có token) cần đọc trước
// khi hiện/ẩn ô SĐT (PR-2, _internal/PLAN_XAC_THUC_SDT_OTP_2026-09-11.md mục 4 PR-2 việc 1).
// PLAN_SUA_SAU_NGHIEM_THU_2026-09-29 mục 1.F — không còn limiter riêng cho /me, /refresh-token,
// /logout, /features, /invitation-info (trước đây bị authLimiter áp cho cả router đếm nhầm); chỉ
// còn globalLimiter chung (app.js:158, 300/IP hoặc 1000/người dùng mỗi 15 phút).
router.get('/features', authController.getFeatures.bind(authController));

// Quên mật khẩu — gửi email reset
router.post('/forgot-password',
  authCredentialLimiter,
  [body('email').trim().isEmail().withMessage('Email không hợp lệ')],
  handleValidationErrors,
  authController.forgotPassword.bind(authController)
);

// Đặt lại mật khẩu bằng token từ email
router.post('/reset-password',
  authCredentialLimiter,
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
  authCredentialLimiter,
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

// Lấy thông tin lời mời nhân viên bằng token
router.get('/invitation-info', authController.getInvitationInfo.bind(authController));

// Đổi mật khẩu khi bị yêu cầu (must_change_password = TRUE)
router.post('/change-password',
  authCredentialLimiter,
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

// ─── Xác thực hai lớp (2FA, TOTP) ───────────────────────────────────────────
// Bước 2 của đăng nhập: đổi challengeToken (login/google-login trả về khi tài khoản đã bật 2FA) + mã
// → phiên. Không cần authMiddleware (chưa có access token). Chỉ đếm lượt lỗi theo IP.
router.post('/2fa/verify',
  twoFactorVerifyLimiter,
  [
    body('challengeToken').isString().notEmpty().withMessage('Thiếu challengeToken'),
    body('code').isString().trim().isLength({ min: 6, max: 12 }).withMessage('Mã xác thực không hợp lệ'),
  ],
  handleValidationErrors,
  authController.verifyTwoFactor.bind(authController)
);

router.get('/2fa/status', authMiddleware, twoFactorController.getStatus);

router.post('/2fa/setup', authCredentialLimiter, authMiddleware, twoFactorController.beginSetup);

const twoFactorCodeValidator = body('code').isString().trim().isLength({ min: 6, max: 12 }).withMessage('Mã xác thực không hợp lệ');

router.post('/2fa/enable',
  authCredentialLimiter,
  authMiddleware,
  [twoFactorCodeValidator],
  handleValidationErrors,
  twoFactorController.enable
);

router.post('/2fa/disable',
  authCredentialLimiter,
  authMiddleware,
  [twoFactorCodeValidator, body('password').optional({ nullable: true }).isString()],
  handleValidationErrors,
  twoFactorController.disable
);

router.post('/2fa/recovery-codes',
  authCredentialLimiter,
  authMiddleware,
  [twoFactorCodeValidator],
  handleValidationErrors,
  twoFactorController.regenerateRecoveryCodes
);

export default router;
