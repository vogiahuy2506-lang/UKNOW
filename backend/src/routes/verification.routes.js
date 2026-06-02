import express from 'express';
import { body } from 'express-validator';
import verificationController from '../controllers/verification.controller.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();

// Gửi mã xác minh
router.post('/send-code',
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

export default router;
