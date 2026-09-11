import express from 'express';
import { body } from 'express-validator';
import verificationController from '../controllers/verification.controller.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import { authLimiter, phoneOtpSendLimiter } from '../middleware/rateLimiter.middleware.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

// Gửi mã xác minh — authLimiter chống email bombing
router.post('/send-code',
  authLimiter,
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
  ],
  handleValidationErrors,
  verificationController.sendCode.bind(verificationController)
);

// Xác minh mã
router.post('/verify-code',
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
    body('code')
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('Mã xác minh phải 6 số'),
  ],
  handleValidationErrors,
  verificationController.verifyCode.bind(verificationController)
);

// ─── OTP theo SĐT (PR-1, xác thực SĐT) — yêu cầu đăng nhập ──────────────────────────────
// authLimiter (chung) + phoneOtpSendLimiter (riêng theo IP, chỉ trên send-code — SMS tốn
// tiền thật) — Bẫy #2 trong plan.

router.post('/phone/send-code',
  authMiddleware,
  authLimiter,
  phoneOtpSendLimiter,
  [
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Số điện thoại không được để trống'),
  ],
  handleValidationErrors,
  verificationController.sendPhoneCode.bind(verificationController)
);

router.post('/phone/verify',
  authMiddleware,
  authLimiter,
  [
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Số điện thoại không được để trống'),
    body('code')
      .trim()
      .isLength({ min: 6, max: 6 })
      .withMessage('Mã xác thực phải 6 số'),
  ],
  handleValidationErrors,
  verificationController.verifyPhoneCode.bind(verificationController)
);

export default router;
