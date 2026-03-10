import express from 'express';
import { body, param, query } from 'express-validator';
import authMiddleware from '../middleware/auth.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';
import zaloSettingsController from '../controllers/zaloSettings.controller.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/zalo/accounts
 * Purpose: Lấy danh sách tài khoản Zalo đã lưu của user hiện tại.
 * Response: { success, data: { items: [...] } }
 */
router.get('/accounts', zaloSettingsController.getAccounts.bind(zaloSettingsController));

/**
 * DELETE /api/zalo/accounts/:id
 * Purpose: Xóa một tài khoản Zalo theo ID.
 * Params: { id }
 * Response: { success, message }
 */
router.delete(
  '/accounts/:id',
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.deleteAccount.bind(zaloSettingsController)
);

/**
 * PATCH /api/zalo/accounts/:id/default
 * Purpose: Đặt tài khoản gửi Zalo mặc định.
 * Params: { id }
 * Response: { success, message }
 */
router.patch(
  '/accounts/:id/default',
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.setDefaultAccount.bind(zaloSettingsController)
);

/**
 * POST /api/zalo/accounts/:id/restore-session
 * Purpose: Khôi phục session Zalo từ cookie_text đã lưu cho một tài khoản.
 * Params: { id }
 * Response: { success, message, data: { account } }
 */
router.post(
  '/accounts/:id/restore-session',
  [param('id').isInt({ min: 1 }).withMessage('ID tài khoản không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.restoreAccountSessionByCookie.bind(zaloSettingsController)
);

/**
 * POST /api/zalo/accounts/login-qr
 * Purpose: Tạo phiên đăng nhập QR cho nhiều tài khoản Zalo.
 * Body: {}
 * Response: { success, message, data: { qrPath, qrImage, mode, sessionKey } }
 */
router.post('/accounts/login-qr', zaloSettingsController.loginQr.bind(zaloSettingsController));

/**
 * GET /api/zalo/accounts/login-qr/:sessionKey/status
 * Purpose: Kiểm tra trạng thái đăng nhập sau khi người dùng quét QR.
 * Params: { sessionKey }
 * Response: { success, data: { status, message, account } }
 */
router.get(
  '/accounts/login-qr/:sessionKey/status',
  [param('sessionKey').trim().notEmpty().withMessage('sessionKey không hợp lệ')],
  handleValidationErrors,
  zaloSettingsController.getQrLoginStatus.bind(zaloSettingsController)
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
