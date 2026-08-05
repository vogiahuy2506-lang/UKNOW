import express from 'express';
import jwt from 'jsonwebtoken';
import chatbotController from '../controllers/chatbot.controller.js';
import unifiedInboxController from '../controllers/unifiedInbox.controller.js';
import zaloPersonalSyncController from '../controllers/zaloPersonalSync.controller.js';
import authMiddleware, {
  attachSseUserIdForRateLimit,
  resolveUserContext,
} from '../middleware/auth.middleware.js';
import { requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';
import { sseLimiter } from '../middleware/rateLimiter.middleware.js';
import sseService from '../services/sse.service.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
    console.error('[SSE] JWT verify failed:', err.message, 'token prefix:', String(token).substring(0, 50));
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }

  const userIdentifierClaim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
  const userId = decoded.userId || decoded.userIdentifier || decoded.nameidentifier || decoded[userIdentifierClaim];
  if (!userId) {
    return res.status(401).json({ success: false, message: 'Invalid token - no userId' });
  }

  try {
    // EventSource cannot send X-Owner-Context — always self context (see plan out-of-scope).
    req.user = await resolveUserContext(userId);
  } catch (err) {
    if (err.status && err.body) {
      return res.status(err.status).json(err.body);
    }
    console.error('[SSE] resolveUserContext failed:', err.message);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const passwordGate = await runGate(requirePasswordChange, req, res);
  if (!passwordGate.ok) return;
  const planGate = await runGate(requireActivePlan, req, res);
  if (!planGate.ok) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', userId: String(userId) })}\n\n`);

  sseService.addClient(userId, res);

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
    sseService.removeClient(userId, res);
  });
  res.on('close', clearHeartbeat);
});

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// ── Knowledge Base ───────────────────────────────────────────────

router.get('/kb', chatbotController.listKBs.bind(chatbotController));
router.post('/kb', chatbotController.createKB.bind(chatbotController));
router.get('/kb/:id', chatbotController.getKB.bind(chatbotController));
router.put('/kb/:id', chatbotController.updateKB.bind(chatbotController));
router.delete('/kb/:id', chatbotController.deleteKB.bind(chatbotController));

// KB Documents
router.get('/kb/:kbId/documents', chatbotController.listDocuments.bind(chatbotController));
router.post('/kb/:kbId/documents/upload', upload.single('file'), chatbotController.uploadDocument.bind(chatbotController));
router.post('/kb/:kbId/documents/text', chatbotController.addTextDocument.bind(chatbotController));
router.post('/kb/:kbId/documents/url', chatbotController.addUrlDocument.bind(chatbotController));
router.delete('/kb/:kbId/documents/:docId', chatbotController.deleteDocument.bind(chatbotController));
router.post('/kb/:kbId/documents/:docId/reprocess', chatbotController.reprocessDocument.bind(chatbotController));
router.get('/kb/:kbId/chunks', chatbotController.getChunks.bind(chatbotController));

// ── Sub-Assistant ────────────────────────────────────────────────

router.get('/sub-assistants', chatbotController.listSubAssistants.bind(chatbotController));
router.post('/sub-assistants', chatbotController.createSubAssistant.bind(chatbotController));
router.get('/sub-assistants/:id', chatbotController.getSubAssistant.bind(chatbotController));
router.put('/sub-assistants/:id', chatbotController.updateSubAssistant.bind(chatbotController));
router.delete('/sub-assistants/:id', chatbotController.deleteSubAssistant.bind(chatbotController));

// ── Chatbot Settings ────────────────────────────────────────────

router.get('/chatbot/settings/:channel', chatbotController.getChatbotSettings.bind(chatbotController));
router.put('/chatbot/settings/:channel', chatbotController.updateChatbotSettings.bind(chatbotController));

// ── Custom Chatbots (Studio) ──────────────────────────────────────

router.get('/custom-chatbots', chatbotController.listCustomChatbots.bind(chatbotController));
router.post('/custom-chatbots', chatbotController.createCustomChatbot.bind(chatbotController));
router.get('/custom-chatbots/:chatbotId', chatbotController.getCustomChatbot.bind(chatbotController));
router.put('/custom-chatbots/:chatbotId', chatbotController.updateCustomChatbot.bind(chatbotController));
router.delete('/custom-chatbots/:chatbotId', chatbotController.deleteCustomChatbot.bind(chatbotController));
router.get('/custom-chatbots/:chatbotId/documents', chatbotController.getCustomChatbotDocuments.bind(chatbotController));

// Chatbot Channel Connections
router.get('/custom-chatbots/:chatbotId/channels', chatbotController.getChatbotChannels.bind(chatbotController));
router.post('/custom-chatbots/:chatbotId/channels/zalo-oa', chatbotController.connectChatbotZaloOA.bind(chatbotController));
router.post('/custom-chatbots/:chatbotId/channels/facebook', chatbotController.connectChatbotFacebook.bind(chatbotController));
router.delete('/custom-chatbots/:chatbotId/channels/:channelType', chatbotController.disconnectChatbotChannel.bind(chatbotController));

// ── Channel Connections ──────────────────────────────────────────

router.get('/channels', chatbotController.listChannels.bind(chatbotController));
router.post('/channels/connect/zalo-oa', chatbotController.connectZaloOA.bind(chatbotController));
router.post('/channels/connect/facebook', chatbotController.connectFacebook.bind(chatbotController));
router.delete('/channels/:channel', chatbotController.disconnectChannel.bind(chatbotController));
router.post('/channels/test/zalo-oa', chatbotController.testZaloOAConnection.bind(chatbotController));
router.post('/channels/test/facebook', chatbotController.testFacebookConnection.bind(chatbotController));

// ── Web Widget ──────────────────────────────────────────────────

router.get('/widgets', chatbotController.listWidgets.bind(chatbotController));
router.post('/widgets', chatbotController.createWidget.bind(chatbotController));
router.put('/widgets/:id', chatbotController.updateWidget.bind(chatbotController));
router.delete('/widgets/:id', chatbotController.deleteWidget.bind(chatbotController));

// NOTE: visitor webchat start/messages routes removed (orphan + cross-tenant IDOR).
// Inbox uses /inbox/*; public widget uses /api/chatbot-public/custom-chatbot/*.

// ── Unified Inbox ────────────────────────────────────────────────

router.get('/inbox/conversations', unifiedInboxController.getConversations.bind(unifiedInboxController));
router.get('/inbox/conversations/:id', unifiedInboxController.getConversation.bind(unifiedInboxController));
router.get('/inbox/conversations/:id/messages', unifiedInboxController.getMessages.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/messages', unifiedInboxController.sendMessage.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/read', unifiedInboxController.markAsRead.bind(unifiedInboxController));
router.delete('/inbox/conversations/:id', unifiedInboxController.deleteConversation.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/ai-pause', unifiedInboxController.setAiPaused.bind(unifiedInboxController));
router.get('/inbox/unread-count', unifiedInboxController.getUnreadCount.bind(unifiedInboxController));

// ── Zalo Personal Account Chatbot Settings ─────────────────────────

router.get('/zalo-account/:zaloSettingId/chatbot', chatbotController.getZaloAccountChatbotSettings.bind(chatbotController));
router.put('/zalo-account/:zaloSettingId/chatbot', chatbotController.updateZaloAccountChatbotSettings.bind(chatbotController));
router.post('/zalo-account/:zaloSettingId/chatbot/toggle', chatbotController.toggleZaloAccountChatbot.bind(chatbotController));
router.get('/zalo-accounts/chatbot', chatbotController.listZaloAccountsWithChatbotSettings.bind(chatbotController));

// ── Outbox ───────────────────────────────────────────────────────

router.get('/inbox/outbox', unifiedInboxController.getOutboxMessages.bind(unifiedInboxController));
router.get('/inbox/outbox/:id', unifiedInboxController.getOutboxMessage.bind(unifiedInboxController));

// ── Zalo Personal Sync ───────────────────────────────────────────

router.get('/zalo-personal/sync', zaloPersonalSyncController.sync.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/contacts', zaloPersonalSyncController.syncContacts.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/groups', zaloPersonalSyncController.syncGroups.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/status', zaloPersonalSyncController.getSyncStatus.bind(zaloPersonalSyncController));
router.post('/zalo-personal/sync/chat-history', zaloPersonalSyncController.syncChatHistory.bind(zaloPersonalSyncController));
router.post('/zalo-personal/sync/group-history', zaloPersonalSyncController.syncAllGroupHistory.bind(zaloPersonalSyncController));
router.get('/zalo-personal/history', zaloPersonalSyncController.getChatHistory.bind(zaloPersonalSyncController));
router.get('/zalo-personal/group-members', zaloPersonalSyncController.getGroupMembers.bind(zaloPersonalSyncController));
router.get('/zalo-personal/group-senders', zaloPersonalSyncController.getGroupSenders.bind(zaloPersonalSyncController));

export default router;
