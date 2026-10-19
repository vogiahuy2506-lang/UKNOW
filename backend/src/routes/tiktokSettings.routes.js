import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/authorization.middleware.js';
import tiktokSettingsController from '../controllers/tiktokSettings.controller.js';

const router = express.Router();

/**
 * TikTok Business connection management (per-user).
 * ChannelSettings tab TikTok (PR-4) sẽ gọi các endpoint này.
 *
 * Permission: `chatbot_channels_manage` — same với Facebook / Zalo.
 * Lưu ý: callback endpoint mount ở `webhook.routes.js` (public, không auth —
 * verify qua state HMAC). Pattern copy từ `oauth.controller.js`:
 *   - init/refresh/delete/test-send: cần auth
 *   - callback: public
 *
 * Việc 3.2 của plan tiktok-business-messaging-integration.md.
 */

router.get('/tiktok-business/connect', authMiddleware, requirePermission('chatbot_channels_manage'), tiktokSettingsController.connect.bind(tiktokSettingsController));
router.get('/tiktok-business/accounts', authMiddleware, requirePermission('chatbot_channels_manage'), tiktokSettingsController.listAccounts.bind(tiktokSettingsController));
router.post('/tiktok-business/accounts/:id/refresh', authMiddleware, requirePermission('chatbot_channels_manage'), tiktokSettingsController.refreshAccount.bind(tiktokSettingsController));
router.delete('/tiktok-business/accounts/:id', authMiddleware, requirePermission('chatbot_channels_manage'), tiktokSettingsController.deleteAccount.bind(tiktokSettingsController));
router.post('/tiktok-business/accounts/:id/test-send', authMiddleware, requirePermission('chatbot_channels_manage'), tiktokSettingsController.testSend.bind(tiktokSettingsController));

export default router;
