import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/authorization.middleware.js';
import facebookSettingsController from '../controllers/facebookSettings.controller.js';

const router = express.Router();

/**
 * Facebook Page connection management (per-user).
 * ChannelSettings tab Facebook uses these endpoints to:
 *   - list connected pages
 *   - bulk-refresh page tokens
 *   - refresh a single page token
 *   - disconnect a page (cascades to chatbot_channel_connections)
 *
 * Permission: chatbot_channels_manage — mirrors the WhatsApp/Zalo settings tabs.
 */

router.get('/facebook-connections', authMiddleware, requirePermission('chatbot_channels_manage'), facebookSettingsController.listConnections.bind(facebookSettingsController));
router.post('/facebook-connections/refresh-all', authMiddleware, requirePermission('chatbot_channels_manage'), facebookSettingsController.refreshAllConnections.bind(facebookSettingsController));
router.post('/facebook-connections/:id/refresh-token', authMiddleware, requirePermission('chatbot_channels_manage'), facebookSettingsController.refreshConnection.bind(facebookSettingsController));
router.delete('/facebook-connections/:id', authMiddleware, requirePermission('chatbot_channels_manage'), facebookSettingsController.deleteConnection.bind(facebookSettingsController));

export default router;
