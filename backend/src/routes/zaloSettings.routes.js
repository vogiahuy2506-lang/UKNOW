import express from 'express';
import { body, param, query } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import zaloSettingsController from '../controllers/zaloSettings.controller.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Get accounts — chỉ cần auth
router.get('/accounts', zaloSettingsController.getAccounts.bind(zaloSettingsController));

// Create account — cần quyền zalo_settings
router.post('/accounts/login-qr',
  requirePermission('zalo_settings'),
  zaloSettingsController.loginQr.bind(zaloSettingsController)
);

// Check QR status — cần quyền zalo_settings
router.get('/accounts/login-qr/:sessionKey/status',
  requirePermission('zalo_settings'),
  [param('sessionKey').trim().notEmpty().withMessage('sessionKey không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.getQrLoginStatus.bind(zaloSettingsController)
);

// Delete — cần quyền zalo_settings
router.delete(
  '/accounts/:id',
  requirePermission('zalo_settings'),
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.deleteAccount.bind(zaloSettingsController)
);

// Set default — cần quyền zalo_settings
router.patch(
  '/accounts/:id/default',
  requirePermission('zalo_settings'),
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.setDefaultAccount.bind(zaloSettingsController)
);

// Restore session — cần quyền zalo_settings
router.post(
  '/accounts/:id/restore-session',
  requirePermission('zalo_settings'),
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.restoreAccountSessionByCookie.bind(zaloSettingsController)
);

// Restore account session by cookie — cần quyền zalo_settings
router.post(
  '/accounts/:id/restore-session-by-cookie',
  requirePermission('zalo_settings'),
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.restoreAccountSessionByCookie.bind(zaloSettingsController)
);

/**
 * POST /api/zalo/preview/send-personal
 * Purpose: Gửi tin nhắn Zalo cá nhân trong preview Campaign Builder.
 * Body: { accountId, recipients: string[], recipientType?: 'phone'|'uid', message }.
 * Response: { success, data: { items, meta } }.
 */
router.post(
  '/preview/send-personal',
  [
    body('accountId').notEmpty().withMessage('accountId là bắt buộc'),
    body('recipients').isArray({ min: 1 }).withMessage('recipients phải là mảng và không được rỗng'),
    body('recipientType')
      .optional()
      .isIn(['phone', 'uid'])
      .withMessage('recipientType phải là phone hoặc uid'),
    body('message').trim().notEmpty().withMessage('message là bắt buộc'),
  ],
  handleValidationErrors,
  zaloSettingsController.previewSendPersonalMessage.bind(zaloSettingsController)
);

/**
 * POST /api/zalo/preview/send-friend-request
 * Purpose: Gửi lời mời kết bạn Zalo trong preview Campaign Builder.
 * Body: { accountId, recipients: string[], message }.
 * Response: { success, data: { items, meta } }.
 */
router.post(
  '/preview/send-friend-request',
  [
    body('accountId').notEmpty().withMessage('accountId là bắt buộc'),
    body('recipients').isArray({ min: 1 }).withMessage('recipients phải là mảng và không được rỗng'),
    body('message').trim().notEmpty().withMessage('message là bắt buộc'),
  ],
  handleValidationErrors,
  zaloSettingsController.previewSendFriendRequest.bind(zaloSettingsController)
);

/**
 * POST /api/zalo/preview/send-group
 * Purpose: Gửi tin nhắn nhóm Zalo trong preview Campaign Builder.
 * Body: { accountId, groupIds: string[], message }.
 * Response: { success, data: { items, meta } }.
 */
router.post(
  '/preview/send-group',
  [
    body('accountId').notEmpty().withMessage('accountId là bắt buộc'),
    body('groupIds').isArray({ min: 1 }).withMessage('groupIds phải là mảng và không được rỗng'),
    body('message').trim().notEmpty().withMessage('message là bắt buộc'),
  ],
  handleValidationErrors,
  zaloSettingsController.previewSendGroupMessage.bind(zaloSettingsController)
);

/**
 * GET /api/zalo/preview/friends
 * Purpose: Lấy danh sách bạn bè từ tài khoản Zalo đã chọn.
 * Query: { accountId, count?, page? }.
 * Response: { success, data: { items, meta } }.
 */
router.get(
  '/preview/friends',
  [
    query('accountId').trim().notEmpty().withMessage('accountId là bắt buộc'),
    query('count').optional().isInt({ min: 1 }).withMessage('count không hợp lệ'),
    query('page').optional().isInt({ min: 1 }).withMessage('page không hợp lệ'),
  ],
  handleValidationErrors,
  zaloSettingsController.previewGetAllFriends.bind(zaloSettingsController)
);

/**
 * GET /api/zalo/preview/groups
 * Purpose: Lấy danh sách nhóm từ tài khoản Zalo đã chọn.
 * Query: { accountId }.
 * Response: { success, data: { items, meta } }.
 */
router.get(
  '/preview/groups',
  [query('accountId').trim().notEmpty().withMessage('accountId là bắt buộc')],
  handleValidationErrors,
  zaloSettingsController.previewGetAllGroups.bind(zaloSettingsController)
);

export default router;
