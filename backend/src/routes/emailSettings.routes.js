import express from 'express';
import { body } from 'express-validator';
import emailSettingsController from '../controllers/emailSettings.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Get all
router.get('/', emailSettingsController.getAll.bind(emailSettingsController));

// Get active email settings for selection (must be before /:id)
router.get('/active', emailSettingsController.getActiveSettings.bind(emailSettingsController));

// Get by id
router.get('/:id', emailSettingsController.getById.bind(emailSettingsController));

// Create
router.post('/',
  [
    body('name').trim().notEmpty().withMessage('Tên không được để trống'),
    body('replyTo').optional().isEmail().withMessage('Reply-To email không hợp lệ'),
    body('email').optional().isEmail().withMessage('Email không hợp lệ'),
    body('smtpHost').optional().trim(),
    body('smtpPort').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 65535 }).withMessage('SMTP port không hợp lệ'),
    body('smtpUsername').optional().trim(),
    body('smtpPassword').optional().trim()
  ],
  handleValidationErrors,
  emailSettingsController.create.bind(emailSettingsController)
);

// Update
router.put('/:id',
  [
    body('name').optional().trim().notEmpty().withMessage('Tên không được để trống'),
    body('replyTo').optional().isEmail().withMessage('Reply-To email không hợp lệ'),
    body('smtpPort').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 65535 }).withMessage('SMTP port không hợp lệ')
  ],
  handleValidationErrors,
  emailSettingsController.update.bind(emailSettingsController)
);

// Delete
router.delete('/:id', emailSettingsController.delete.bind(emailSettingsController));

// Test connection
router.post('/test-connection',
  [
    body('smtpHost').trim().notEmpty().withMessage('SMTP host không được để trống'),
    body('smtpPort').custom((value) => {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('SMTP port không hợp lệ');
      }
      return true;
    }),
    body('smtpUsername').trim().notEmpty().withMessage('SMTP username không được để trống'),
    body('smtpPassword').trim().notEmpty().withMessage('SMTP password không được để trống')
  ],
  handleValidationErrors,
  emailSettingsController.testConnection.bind(emailSettingsController)
);

// Send test email
router.post('/:id/send-test',
  [
    body('to').isEmail().withMessage('Email người nhận không hợp lệ'),
    body('subject').optional().isLength({ min: 1 }).withMessage('Tiêu đề không được để trống'),
    body('content').optional().isLength({ min: 1 }).withMessage('Nội dung không được để trống')
  ],
  handleValidationErrors,
  emailSettingsController.sendTestEmail.bind(emailSettingsController)
);

// Domain verification flow (Hướng 2)
// Initiate domain verification: get DNS records to set up
router.post('/:id/domain-verification/initiate',
  emailSettingsController.initiateDomainVerification.bind(emailSettingsController)
);

// Poll SendGrid to check if domain is verified
router.get('/:id/domain-verification/status',
  emailSettingsController.getDomainVerificationStatus.bind(emailSettingsController)
);

router.post('/send-email',
  [
    body('fromEmailId').isInt().withMessage('Email gửi không hợp lệ'),
    body('to').isEmail().withMessage('Email người nhận không hợp lệ'),
    body('replyTo').optional().isEmail().withMessage('Reply-To email không hợp lệ'),
    body('cc').optional().custom((value) => {
      const list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/g).map((v) => v.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!list.every((e) => emailRegex.test(e))) {
        throw new Error('Email CC không hợp lệ');
      }
      return true;
    }),
    body('bcc').optional().custom((value) => {
      const list = Array.isArray(value) ? value : String(value || '').split(/[,;\n]/g).map((v) => v.trim()).filter(Boolean);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!list.every((e) => emailRegex.test(e))) {
        throw new Error('Email BCC không hợp lệ');
      }
      return true;
    }),
    body('subject').optional().isLength({ min: 1 }).withMessage('Tiêu đề không được để trống'),
    body('content').optional().isLength({ min: 1 }).withMessage('Nội dung không được để trống')
  ],
  handleValidationErrors,
  emailSettingsController.sendCustomEmail.bind(emailSettingsController)
);

export default router;
