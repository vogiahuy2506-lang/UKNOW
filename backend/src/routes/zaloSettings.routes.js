import express from 'express';
import { body, param, query } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import zaloSettingsController from '../controllers/zaloSettings.controller.js';
import { requirePermission, requireActivePlan, requirePasswordChange, requirePhone } from '../middleware/authorization.middleware.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);
router.use(requirePermission('zalo_settings'));

// Get accounts
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

// Giới hạn gửi/ngày do người dùng tự đặt (PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22 Việc 6) —
// cần quyền zalo_settings. Trần kỹ thuật chống tràn INTEGER, không phải lời khuyên.
router.patch(
  '/accounts/:id/send-limit',
  requirePermission('zalo_settings'),
  [
    param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ'),
    // `exists()` là bắt buộc, không phải thừa: controller đọc `req.body?.userDailySendLimit` rồi
    // quy `undefined` về `null`, nên body RỖNG sẽ XOÁ TRẮNG giới hạn đang có và vẫn trả 200 báo
    // thành công. Đo được 22/09 trong lượt soát: đặt 60 → PATCH `{}` → cột về NULL, người dùng
    // không hề biết nick của mình vừa mất phanh. Đường email (`PUT /api/email-settings/:id`) làm
    // ngược lại — vắng field = giữ nguyên (`hasUserDailySendLimit`) — nên hai endpoint của cùng
    // một tính năng phải thống nhất: muốn xoá thì gửi `null` tường minh.
    body('userDailySendLimit').exists()
      .withMessage('Thiếu userDailySendLimit — gửi null nếu muốn bỏ giới hạn'),
    body('userDailySendLimit').optional({ nullable: true })
      .isInt({ min: 1, max: 100000 })
      .withMessage('Giới hạn gửi/ngày phải từ 1 đến 100000'),
  ],
  handleValidationErrors,
  zaloSettingsController.updateSendLimit.bind(zaloSettingsController)
);

// Tốc độ gửi Zalo cá nhân (3 mức: safe, fast, very_fast) — cần quyền zalo_settings
router.patch(
  '/accounts/:id/send-speed',
  requirePermission('zalo_settings'),
  [
    param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ'),
    body('sendSpeed')
      .exists({ checkFalsy: false })
      .withMessage('Thiếu sendSpeed — bắt buộc chọn một trong safe, fast, very_fast')
      .isIn(['safe', 'fast', 'very_fast'])
      .withMessage('Mức tốc độ gửi không hợp lệ (safe, fast, very_fast)'),
  ],
  handleValidationErrors,
  zaloSettingsController.updateSendSpeed.bind(zaloSettingsController)
);

// Restore session — cần quyền zalo_settings
router.post(
  '/accounts/:id/restore-session',
  requirePermission('zalo_settings'),
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.restoreAccountSessionByCookie.bind(zaloSettingsController)
);

// Clear needs_reauth fail window so keep-alive/cron will try again
router.post(
  '/accounts/:id/retry-restore',
  requirePermission('zalo_settings'),
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.retryRestore.bind(zaloSettingsController)
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
