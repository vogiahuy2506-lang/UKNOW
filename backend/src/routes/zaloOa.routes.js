import express from 'express';
import zaloOaSettingsController from '../controllers/zaloOaSettings.controller.js';
import zaloDomainVerifyController from '../controllers/zaloDomainVerify.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/authorization.middleware.js';

const router = express.Router();

// Tất cả route đều yêu cầu đăng nhập và quyền chatbot_channels_manage
router.use(authMiddleware);
router.use(requirePermission('chatbot_channels_manage'));

// ── Quản lý danh sách Zalo OA cấp Workspace ──
router.get('/accounts', zaloOaSettingsController.listAccounts.bind(zaloOaSettingsController));
router.post('/accounts', zaloOaSettingsController.connectAccount.bind(zaloOaSettingsController));
router.delete('/accounts/:id', zaloOaSettingsController.deleteAccount.bind(zaloOaSettingsController));

// ── Xác thực tên miền Zalo (Domain Verification) ──
router.get('/domain-verify', zaloDomainVerifyController.getVerificationCode.bind(zaloDomainVerifyController));
router.post('/domain-verify', zaloDomainVerifyController.saveVerificationCode.bind(zaloDomainVerifyController));

export default router;

