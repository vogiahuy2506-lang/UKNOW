import express from 'express';
import { body } from 'express-validator';
import userController from '../controllers/user.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin, requireSelfContext } from '../middleware/authorization.middleware.js';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();
// All routes require authentication
router.use(authMiddleware);

// Bố cục menu ứng dụng cho khách (/app).
// Đặt trước mọi cổng router-level (nếu có) để người dùng bị chặn SĐT/mật khẩu vẫn tải được menu đầy đủ.
router.get('/app-menu-layout', userController.getAppMenuLayout.bind(userController));

// Get profile
router.get('/profile', userController.getProfile.bind(userController));

// P9 — quyền dùng kênh Telegram/WhatsApp theo gói của chủ workspace (FE ẩn/khoá giao diện kênh)
router.get('/channel-entitlements', userController.getChannelEntitlements.bind(userController));

// Lịch sử mua gói dịch vụ của user đang đăng nhập
router.get('/my-orders', userController.getMyOrders.bind(userController));

/**
 * PUT /api/users/me/phone
 * KHÔNG gắn requirePhone — đây là lối thoát duy nhất của cổng đó. Gắn vào sẽ tạo
 * vòng lặp chết: phải có SĐT mới được nhập SĐT (Bẫy #4, PLAN_SDT_BAT_BUOC_SYNC_SHEET).
 */
router.put(
  '/me/phone',
  [body('phone').trim().notEmpty().withMessage('Vui lòng nhập số điện thoại')],
  handleValidationErrors,
  userController.updatePhone.bind(userController)
);

/**
 * POST /api/users/me/referrer
 * Liên kết người giới thiệu khi vừa đăng ký tài khoản mới.
 */
router.post(
  '/me/referrer',
  [body('referralCode').trim().notEmpty().withMessage('Vui lòng nhập mã giới thiệu')],
  handleValidationErrors,
  userController.bindReferrer.bind(userController)
);

/**
 * Ghi nhận người dùng bấm "Bỏ qua" ở bảng nhập mã giới thiệu — sau đó không cho nhập bổ sung
 * (luật sếp 19/09/2026). Lưu ở server để đổi máy/trình duyệt cũng không hỏi lại.
 */
router.post(
  '/me/referral-prompt/dismiss',
  userController.dismissReferralPrompt.bind(userController)
);

/**
 * POST /api/users/me/memberships/:ownerId/accept
 * POST /api/users/me/memberships/:ownerId/decline
 * Người bị liên kết (origin='linked', accepted_at NULL) tự chấp nhận/từ chối lời mời của một chủ.
 * requireSelfContext: không chấp nhận/từ chối hộ trong khi đang đứng ở không gian của chủ khác.
 */
router.post(
  '/me/memberships/:ownerId/accept',
  requireSelfContext,
  userController.acceptMembership.bind(userController)
);
router.post(
  '/me/memberships/:ownerId/decline',
  requireSelfContext,
  userController.declineMembership.bind(userController)
);

// Hồ sơ xuất hoá đơn người dùng tự lưu
router.get('/invoice-profile', userController.getInvoiceProfile.bind(userController));
router.put('/invoice-profile', userController.updateInvoiceProfile.bind(userController));
router.delete('/invoice-profile', userController.deleteInvoiceProfile.bind(userController));

/**
 * POST /api/users/consents
 * GET /api/users/consents
 * Ghi nhận đồng ý bổ sung và lấy lịch sử đồng ý pháp lý (PR-N3a).
 */
router.post('/consents', userController.recordReconsent.bind(userController));
router.get('/consents', userController.getConsents.bind(userController));

/**
 * PATCH /api/users/bot-daily-reply-cap
 * Chủ tài khoản đặt trần lượt bot trả lời mỗi ngày (null/empty = bỏ giới hạn).
 */
router.patch(
  '/bot-daily-reply-cap',
  requireSelfContext,
  [
    body('botDailyReplyCap')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || String(value).trim() === '') return true;
        const n = Number.parseInt(String(value), 10);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error('Giới hạn phải là số nguyên dương, hoặc để trống để bỏ giới hạn');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  userController.updateBotDailyReplyCap.bind(userController)
);

/**
 * PATCH /api/users/ai-handoff-auto-resume
 * Chủ tài khoản đặt phút tự bật lại AI sau handoff (null = tắt / bật tay).
 */
router.patch(
  '/ai-handoff-auto-resume',
  requireSelfContext,
  [
    body('aiHandoffAutoResumeMinutes')
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || String(value).trim() === '') return true;
        const n = Number.parseInt(String(value), 10);
        if (![5, 15, 30, 60].includes(n)) {
          throw new Error('Giá trị phải là 5, 15, 30, 60 phút, hoặc để trống để tắt');
        }
        return true;
      }),
  ],
  handleValidationErrors,
  userController.updateAiHandoffAutoResume.bind(userController)
);

// Update profile
/**
 * PUT /api/users/profile
 * Mục đích: Người dùng đang đăng nhập cập nhật thông tin tài khoản cá nhân.
 * Input body: { fullName?, email?, phone? }.
 * Response: thông tin profile sau khi cập nhật.
 */
router.put('/profile',
  [
    body('fullName')
      .optional()
      .trim()
      .isLength({ max: 255 })
      .withMessage('Họ tên không được quá 255 ký tự'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Email không hợp lệ'),
    body('phone')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Số điện thoại không hợp lệ'),
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
      .isLength({ min: 8 })
      .withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Mật khẩu mới phải chứa ít nhất một chữ cái và một số')
  ],
  handleValidationErrors,
  userController.changePassword.bind(userController)
);

export default router;
