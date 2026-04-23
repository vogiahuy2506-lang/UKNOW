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
      .withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
    body('fullName')
      .optional({ checkFalsy: true })
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không được quá 255 ký tự'),
    body('phone')
      .optional({ checkFalsy: true })
      .trim()
      .matches(/^[0-9]{10,11}$/)
      .withMessage('Số điện thoại không hợp lệ')
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

// Refresh token
router.post('/refresh-token',
  [
    body('refreshToken')
      .notEmpty()
      .withMessage('Refresh token không được để trống')
  ],
  handleValidationErrors,
  authController.refreshToken.bind(authController)
);

// Đăng xuất
router.post('/logout', authMiddleware, authController.logout.bind(authController));

// Lấy thông tin user hiện tại
router.get('/me', authMiddleware, authController.getMe.bind(authController));

export default router;
