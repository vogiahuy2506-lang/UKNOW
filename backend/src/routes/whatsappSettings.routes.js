import express from 'express';
import { body, param } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import whatsappSettingsController from '../controllers/whatsappSettings.controller.js';
import whatsappCredentialsController from '../controllers/whatsappCredentials.controller.js';
import {
  requirePermission,
  requireActivePlan,
  requirePasswordChange,
  requirePhone,
} from '../middleware/authorization.middleware.js';

const router = express.Router();

// All routes require auth + active workspace. Permission is `chatbot_channels_manage`
// — same as the channel connection routes on chatbots.
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);
router.use(requirePermission('chatbot_channels_manage'));

// GET /api/whatsapp/accounts — list every WhatsApp connection for the user.
router.get(
  '/accounts',
  whatsappSettingsController.getAccounts.bind(whatsappSettingsController)
);

// POST /api/whatsapp/accounts/oauth/init — start Embedded Signup.
router.post(
  '/accounts/oauth/init',
  whatsappSettingsController.initOAuth.bind(whatsappSettingsController)
);

// GET /api/whatsapp/accounts/oauth/pending?state=... — fetch phone numbers
// the user picked during the Embedded Signup popup.
router.get(
  '/accounts/oauth/pending',
  whatsappSettingsController.getPendingOAuth.bind(whatsappSettingsController)
);

// POST /api/whatsapp/accounts/oauth/complete — persist the connection.
router.post(
  '/accounts/oauth/complete',
  [
    body('chatbotId').isInt({ min: 1 }).withMessage('chatbotId không hợp lệ'),
    body('state').trim().notEmpty().withMessage('state là bắt buộc'),
    body('phone_number_id').trim().notEmpty().withMessage('phone_number_id là bắt buộc'),
    body('waba_id').trim().notEmpty().withMessage('waba_id là bắt buộc'),
    body('phone_number').optional().isString(),
    body('business_id').optional().isString(),
    body('display_name').optional().isString(),
    body('is_default').optional().isBoolean(),
  ],
  handleValidationErrors,
  whatsappSettingsController.completeOAuth.bind(whatsappSettingsController)
);

// DELETE /api/whatsapp/accounts/:id — disconnect a WhatsApp connection.
router.delete(
  '/accounts/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ'),
  ],
  handleValidationErrors,
  whatsappSettingsController.deleteAccount.bind(whatsappSettingsController)
);

// PATCH /api/whatsapp/accounts/:id/default — set as default.
router.patch(
  '/accounts/:id/default',
  [
    param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ'),
  ],
  handleValidationErrors,
  whatsappSettingsController.setDefault.bind(whatsappSettingsController)
);

// PATCH /api/whatsapp/accounts/:id/active — global AI toggle for the account.
router.patch(
  '/accounts/:id/active',
  [
    param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ'),
    body('enabled').isBoolean().withMessage('enabled phải là boolean'),
  ],
  handleValidationErrors,
  whatsappSettingsController.toggleActive.bind(whatsappSettingsController)
);

// ─── User Meta App Credentials (multi-tenant) ────────────────────────────
// Each user registers their own Meta App so they can connect WhatsApp without
// us sharing our App Secret. App Secret is encrypted before storage; it is
// only decrypted server-side when calling Meta Graph API.

router.get(
  '/credentials',
  whatsappCredentialsController.list.bind(whatsappCredentialsController)
);

router.post(
  '/credentials',
  [
    body('appId').trim().notEmpty().withMessage('appId là bắt buộc'),
    body('appSecret').trim().notEmpty().withMessage('appSecret là bắt buộc'),
    body('appName').optional().isString(),
    body('webhookVerifyToken').optional().isString(),
    body('makeDefault').optional().isBoolean(),
  ],
  handleValidationErrors,
  whatsappCredentialsController.upsert.bind(whatsappCredentialsController)
);

router.delete(
  '/credentials/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID không hợp lệ'),
  ],
  handleValidationErrors,
  whatsappCredentialsController.remove.bind(whatsappCredentialsController)
);

router.patch(
  '/credentials/:id/default',
  [
    param('id').isInt({ min: 1 }).withMessage('ID không hợp lệ'),
  ],
  handleValidationErrors,
  whatsappCredentialsController.setDefault.bind(whatsappCredentialsController)
);

router.patch(
  '/credentials/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('ID không hợp lệ'),
    body('isActive').optional().isBoolean(),
    body('appName').optional().isString(),
  ],
  handleValidationErrors,
  whatsappCredentialsController.setActive.bind(whatsappCredentialsController)
);

export default router;
