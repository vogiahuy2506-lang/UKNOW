import express from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get profile
router.get('/profile', userController.getProfile.bind(userController));

// Update profile
router.put('/profile',
  [
    body('fullName')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không được quá 255 ký tự'),
    body('phone')
      .optional()
      .trim()
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

export default router;
