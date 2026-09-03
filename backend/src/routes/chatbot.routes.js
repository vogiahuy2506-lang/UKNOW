import express from 'express';
import jwt from 'jsonwebtoken';
import chatbotController from '../controllers/chatbot.controller.js';
import unifiedInboxController from '../controllers/unifiedInbox.controller.js';
import zaloPersonalSyncController from '../controllers/zaloPersonalSync.controller.js';
import aiActivityController from '../controllers/chatbot/aiActivity.controller.js';
import authMiddleware, {
  attachSseUserIdForRateLimit,
  resolveUserContext,
} from '../middleware/auth.middleware.js';
import {
  requireActivePlan,
  requirePasswordChange,
  requirePhone,
  requirePermission,
  requireSelfContext,
} from '../middleware/authorization.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import { sseLimiter } from '../middleware/rateLimiter.middleware.js';
import sseService from '../services/sse.service.js';
import multer from 'multer';
import { MAX_UPLOAD_FILE_BYTES } from '../utils/uploadLimits.util.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { getStoragePaths } from '../utils/storageCapacity.util.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_BYTES } });
const workspaceUploadCapacityGuard = storageCapacityGuard({ paths: [getStoragePaths().uploads] });

function runGate(middleware, req, res) {
  return new Promise((resolve) => {
    middleware(req, res, (err) => {
      if (err) {
        resolve({ ok: false, error: err });
        return;
      }
      if (res.headersSent) {
        resolve({ ok: false, sent: true });
        return;
      }
      resolve({ ok: true });
    });
  });
}

// ── SSE Stream — MUST stay above router.use(authMiddleware).
// EventSource can only send JWT via ?token=; Bearer auth would always 401.
router.get('/inbox/stream', attachSseUserIdForRateLimit, sseLimiter, async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  let decoded;
  try {
    decoded = jwt.verify(String(token), process.env.JWT_SECRET);
  } catch (err) {
    console.error('[SSE] JWT verify failed:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  const userIdentifierClaim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
  const userId = decoded.userId || decoded.userIdentifier || decoded.nameidentifier || decoded[userIdentifierClaim];
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Invalid token - no userId' });
  }

  try {
    // EventSource cannot send custom headers. The requested owner is still
    // validated against an active membership by resolveUserContext.
    req.user = await resolveUserContext(userId, {
      ownerContextId: req.query.ownerContext || null,
    });
  } catch (err) {
    if (err.status && err.body) {
      return res.status(err.status).json(err.body);
    }
    console.error('[SSE] resolveUserContext failed:', err.message);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const passwordGate = await runGate(requirePasswordChange, req, res);
  if (!passwordGate.ok) return;
  const phoneGate = await runGate(requirePhone, req, res);
  if (!phoneGate.ok) return;
  const planGate = await runGate(requireActivePlan, req, res);
  if (!planGate.ok) return;
  const permissionGate = await runGate(requirePermission('inbox_view'), req, res);
  if (!permissionGate.ok) return;

  const workspaceOwnerId = req.user.activeContext?.type === 'employee'
    ? req.user.activeContext.ownerId
    : req.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  sseService.addClient(workspaceOwnerId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      res.__sseHeartbeat = null;
    }
  }, 30000);
  // Track on res so tests / removeClient can clear if req.close races
  res.__sseHeartbeat = heartbeat;

  const clearHeartbeat = () => {
    if (res.__sseHeartbeat) {
      clearInterval(res.__sseHeartbeat);
      res.__sseHeartbeat = null;
    }
  };

  req.on('close', () => {
    clearHeartbeat();
    sseService.removeClient(workspaceOwnerId, res);
  });
  res.on('close', clearHeartbeat);
});

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);

// ── Knowledge Base ───────────────────────────────────────────────

router.get('/kb', requirePermission('chatbots_manage'), chatbotController.listKBs.bind(chatbotController));
router.post('/kb', requirePermission('chatbots_manage'), chatbotController.createKB.bind(chatbotController));
router.get('/kb/:id', requirePermission('chatbots_manage'), chatbotController.getKB.bind(chatbotController));
router.put('/kb/:id', requirePermission('chatbots_manage'), chatbotController.updateKB.bind(chatbotController));
router.delete('/kb/:id', requirePermission('chatbots_manage'), chatbotController.deleteKB.bind(chatbotController));

// KB Documents
router.get('/kb/:kbId/documents', requirePermission('chatbots_manage'), chatbotController.listDocuments.bind(chatbotController));
router.post('/kb/:kbId/documents/upload', requirePermission('chatbots_manage'), upload.single('file'), chatbotController.uploadDocument.bind(chatbotController));
router.post('/kb/:kbId/documents/text', requirePermission('chatbots_manage'), chatbotController.addTextDocument.bind(chatbotController));
router.post('/kb/:kbId/documents/url', requirePermission('chatbots_manage'), chatbotController.addUrlDocument.bind(chatbotController));
router.delete('/kb/:kbId/documents/:docId', requirePermission('chatbots_manage'), chatbotController.deleteDocument.bind(chatbotController));
router.post('/kb/:kbId/documents/:docId/reprocess', requirePermission('chatbots_manage'), chatbotController.reprocessDocument.bind(chatbotController));
router.get('/kb/:kbId/chunks', requirePermission('chatbots_manage'), chatbotController.getChunks.bind(chatbotController));

// ── Sub-Assistant ────────────────────────────────────────────────

router.get('/sub-assistants', requirePermission('chatbots_manage'), chatbotController.listSubAssistants.bind(chatbotController));
router.post('/sub-assistants', requirePermission('chatbots_manage'), chatbotController.createSubAssistant.bind(chatbotController));
router.get('/sub-assistants/:id', requirePermission('chatbots_manage'), chatbotController.getSubAssistant.bind(chatbotController));
router.put('/sub-assistants/:id', requirePermission('chatbots_manage'), chatbotController.updateSubAssistant.bind(chatbotController));
router.delete('/sub-assistants/:id', requirePermission('chatbots_manage'), chatbotController.deleteSubAssistant.bind(chatbotController));

// ── Chatbot Settings ────────────────────────────────────────────

router.get('/chatbot/settings/:channel', requirePermission('chatbots_manage'), chatbotController.getChatbotSettings.bind(chatbotController));
router.put('/chatbot/settings/:channel', requirePermission('chatbots_manage'), chatbotController.updateChatbotSettings.bind(chatbotController));

// ── Custom Chatbots (Studio) ──────────────────────────────────────

router.get('/custom-chatbots', requirePermission('chatbots_manage'), chatbotController.listCustomChatbots.bind(chatbotController));
router.post('/custom-chatbots', requirePermission('chatbots_manage'), chatbotController.createCustomChatbot.bind(chatbotController));
router.get('/custom-chatbots/:chatbotId', requirePermission('chatbots_manage'), chatbotController.getCustomChatbot.bind(chatbotController));
router.put('/custom-chatbots/:chatbotId', requirePermission('chatbots_manage'), chatbotController.updateCustomChatbot.bind(chatbotController));
router.delete('/custom-chatbots/:chatbotId', requirePermission('chatbots_manage'), chatbotController.deleteCustomChatbot.bind(chatbotController));
router.get('/custom-chatbots/:chatbotId/documents', requirePermission('chatbots_manage'), chatbotController.getCustomChatbotDocuments.bind(chatbotController));

// Chatbot Channel Connections
router.get('/custom-chatbots/:chatbotId/channels', requirePermission('chatbot_channels_manage'), chatbotController.getChatbotChannels.bind(chatbotController));
router.post('/custom-chatbots/:chatbotId/channels/zalo-oa', requirePermission('chatbot_channels_manage'), chatbotController.connectChatbotZaloOA.bind(chatbotController));
router.post('/custom-chatbots/:chatbotId/channels/facebook', requirePermission('chatbot_channels_manage'), chatbotController.connectChatbotFacebook.bind(chatbotController));
router.delete('/custom-chatbots/:chatbotId/channels/:channelType', requirePermission('chatbot_channels_manage'), chatbotController.disconnectChatbotChannel.bind(chatbotController));

// Chatbot Sharing (giữ path /share để tương thích client; ngữ nghĩa giờ là clone)
router.post('/custom-chatbots/:chatbotId/share', requireSelfContext, chatbotController.shareChatbot.bind(chatbotController));
// 4 endpoint dưới đã bỏ share-permission; giữ để client cũ không vỡ UI
router.get('/custom-chatbots/:chatbotId/shares', requireSelfContext, chatbotController.getChatbotShares.bind(chatbotController));
router.delete('/custom-chatbots/:chatbotId/shares/:recipientId', requireSelfContext, chatbotController.revokeShare.bind(chatbotController));
router.get('/shared-with-me', requireSelfContext, chatbotController.getSharedWithMe.bind(chatbotController));
router.get('/shared-by-me', requireSelfContext, chatbotController.getSharedByMe.bind(chatbotController));

// ── Channel Connections ──────────────────────────────────────────

router.get('/channels', requirePermission('chatbot_channels_manage'), chatbotController.listChannels.bind(chatbotController));
router.post('/channels/connect/zalo-oa', requirePermission('chatbot_channels_manage'), chatbotController.connectZaloOA.bind(chatbotController));
router.post('/channels/connect/facebook', requirePermission('chatbot_channels_manage'), chatbotController.connectFacebook.bind(chatbotController));
router.delete('/channels/:channel', requirePermission('chatbot_channels_manage'), chatbotController.disconnectChannel.bind(chatbotController));
router.post('/channels/test/zalo-oa', requirePermission('chatbot_channels_manage'), chatbotController.testZaloOAConnection.bind(chatbotController));
router.post('/channels/test/facebook', requirePermission('chatbot_channels_manage'), chatbotController.testFacebookConnection.bind(chatbotController));

// ── Web Widget ──────────────────────────────────────────────────

router.get('/widgets', requirePermission('chatbots_manage'), chatbotController.listWidgets.bind(chatbotController));
router.post('/widgets', requirePermission('chatbots_manage'), chatbotController.createWidget.bind(chatbotController));
router.put('/widgets/:id', requirePermission('chatbots_manage'), chatbotController.updateWidget.bind(chatbotController));
router.delete('/widgets/:id', requirePermission('chatbots_manage'), chatbotController.deleteWidget.bind(chatbotController));

// NOTE: visitor webchat start/messages routes removed (orphan + cross-tenant IDOR).
// Inbox uses /inbox/*; public widget uses /api/chatbot-public/custom-chatbot/*.

// ── Unified Inbox ────────────────────────────────────────────────

router.get('/inbox/conversations', requirePermission('inbox_view'), unifiedInboxController.getConversations.bind(unifiedInboxController));
router.get('/inbox/conversations/:id', requirePermission('inbox_view'), unifiedInboxController.getConversation.bind(unifiedInboxController));
router.get('/inbox/conversations/:id/messages', requirePermission('inbox_view'), unifiedInboxController.getMessages.bind(unifiedInboxController));
router.post(
  '/inbox/attachments',
  requirePermission('inbox_reply'),
  workspaceUploadCapacityGuard,
  upload.single('file'),
  unifiedInboxController.uploadInboxAttachment.bind(unifiedInboxController)
);
router.post('/inbox/conversations/:id/messages', requirePermission('inbox_reply'), unifiedInboxController.sendMessage.bind(unifiedInboxController));
router.post('/inbox/messages/:messageId/retry', requirePermission('inbox_manage'), unifiedInboxController.retryMessage.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/read', requirePermission('inbox_view'), unifiedInboxController.markAsRead.bind(unifiedInboxController));
router.delete('/inbox/conversations/:id', requirePermission('inbox_manage'), unifiedInboxController.deleteConversation.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/ai-pause', requirePermission('inbox_manage'), unifiedInboxController.setAiPaused.bind(unifiedInboxController));
router.get('/inbox/unread-count', requirePermission('inbox_view'), unifiedInboxController.getUnreadCount.bind(unifiedInboxController));

// ── AI Activity Report & Summaries ──────────────────────────────────
router.get('/inbox/ai-activity', requirePermission('inbox_view'), aiActivityController.getActivityReport.bind(aiActivityController));
router.post('/inbox/ai-activity/resume-all', requirePermission('inbox_manage'), aiActivityController.resumeAllAi.bind(aiActivityController));
router.post(
  '/inbox/ai-activity/summarize',
  requireSelfContext,
  assertAiCreditAvailable('inbox_ai_summary'),
  aiActivityController.summarizeActivity.bind(aiActivityController)
);

// ── Zalo Personal Account Chatbot Settings ─────────────────────────

router.get('/zalo-account/:zaloSettingId/chatbot', requirePermission('chatbot_channels_manage'), chatbotController.getZaloAccountChatbotSettings.bind(chatbotController));
router.put('/zalo-account/:zaloSettingId/chatbot', requirePermission('chatbot_channels_manage'), chatbotController.updateZaloAccountChatbotSettings.bind(chatbotController));
router.post('/zalo-account/:zaloSettingId/chatbot/toggle', requirePermission('chatbot_channels_manage'), chatbotController.toggleZaloAccountChatbot.bind(chatbotController));
router.get('/zalo-accounts/chatbot', requirePermission('chatbot_channels_manage'), chatbotController.listZaloAccountsWithChatbotSettings.bind(chatbotController));

// ── Outbox ───────────────────────────────────────────────────────

router.get('/inbox/outbox', requirePermission('inbox_view'), unifiedInboxController.getOutboxMessages.bind(unifiedInboxController));
router.get('/inbox/outbox/:id', requirePermission('inbox_view'), unifiedInboxController.getOutboxMessage.bind(unifiedInboxController));

// ── Zalo Personal Sync ───────────────────────────────────────────

router.get('/zalo-personal/sync', requirePermission('inbox_manage'), zaloPersonalSyncController.sync.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/contacts', requirePermission('inbox_manage'), zaloPersonalSyncController.syncContacts.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/groups', requirePermission('inbox_manage'), zaloPersonalSyncController.syncGroups.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/status', requirePermission('inbox_view'), zaloPersonalSyncController.getSyncStatus.bind(zaloPersonalSyncController));
router.post('/zalo-personal/sync/chat-history', requirePermission('inbox_manage'), zaloPersonalSyncController.syncChatHistory.bind(zaloPersonalSyncController));
router.post('/zalo-personal/sync/group-history', requirePermission('inbox_manage'), zaloPersonalSyncController.syncAllGroupHistory.bind(zaloPersonalSyncController));
router.get('/zalo-personal/history', requirePermission('inbox_view'), zaloPersonalSyncController.getChatHistory.bind(zaloPersonalSyncController));
router.get('/zalo-personal/friends', requirePermission('inbox_view'), zaloPersonalSyncController.getFriends.bind(zaloPersonalSyncController));
router.get('/zalo-personal/group-members', requirePermission('inbox_view'), zaloPersonalSyncController.getGroupMembers.bind(zaloPersonalSyncController));
router.get('/zalo-personal/group-senders', requirePermission('inbox_view'), zaloPersonalSyncController.getGroupSenders.bind(zaloPersonalSyncController));

export default router;
