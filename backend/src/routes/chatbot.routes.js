import express from 'express';
import jwt from 'jsonwebtoken';
import chatbotController from '../controllers/chatbot.controller.js';
import unifiedInboxController from '../controllers/unifiedInbox.controller.js';
import zaloPersonalSyncController from '../controllers/zaloPersonalSync.controller.js';
import aiActivityController from '../controllers/chatbot/aiActivity.controller.js';
import chatbotContactAlertController from '../controllers/chatbot/chatbotContactAlert.controller.js';
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
import { consumeSseTicket } from '../services/sseTicket.service.js';
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
// EventSource không gửi được header Authorization nên không đi qua authMiddleware. FE xin một VÉ ngắn hạn
// dùng một lần ở POST /inbox/stream-ticket (đi qua authMiddleware, mang X-Owner-Context như mọi API) rồi nối
// `GET /inbox/stream?ticket=...` (H-04: JWT không còn nằm trên URL). `?token=` (JWT) chỉ còn để bản FE cũ đang
// mở trong tab không vỡ — log truy cập đã che cả hai tham số (utils/accessLog.util.js).
let legacySseTokenWarned = false;

router.get('/inbox/stream', attachSseUserIdForRateLimit, sseLimiter, async (req, res) => {
  let userId;
  let ownerContextId = null;

  const ticket = req.query.ticket;
  if (ticket) {
    const claim = consumeSseTicket(String(ticket));
    if (!claim) {
      return res.status(401).json({ success: false, message: 'Invalid ticket', code: 'SSE_TICKET_INVALID' });
    }
    userId = claim.userId;
    ownerContextId = claim.ownerContextId;
  } else {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let decoded;
    try {
      decoded = jwt.verify(String(token), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      console.error('[SSE] JWT verify failed:', err.message);
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    // Token có `purpose` (challenge 2FA...) không phải access token — cùng luật với authMiddleware.
    if (decoded?.purpose) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const userIdentifierClaim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
    userId = decoded.userId || decoded.userIdentifier || decoded.nameidentifier || decoded[userIdentifierClaim];
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token - no userId' });
    }
    ownerContextId = req.query.ownerContext || null;
    if (!legacySseTokenWarned) {
      legacySseTokenWarned = true;
      console.warn('[SSE] Có client còn nối bằng ?token= (bản FE cũ) — vé SSE là đường mới; gỡ nhánh token khi không còn ai dùng.');
    }
  }

  try {
    // The requested owner is still validated against an active membership by resolveUserContext
    // (vé: ownerContextId do server ghi lúc xin vé; token cũ: lấy từ query như trước).
    req.user = await resolveUserContext(userId, { ownerContextId });
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
      // Sự kiện `ping` THẬT (không phải dòng chú thích): EventSource không phát gì cho dòng `: ...`, nên client
      // không biết kết nối còn sống và tự cắt sau 60 giây yên lặng (H-26). Client cũ không có listener thì bỏ qua.
      res.write('event: ping\ndata: {}\n\n');
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

// Chatbot Channel Connections
router.get('/custom-chatbots/:chatbotId/channels', requirePermission('chatbot_channels_manage'), chatbotController.getChatbotChannels.bind(chatbotController));
router.get('/custom-chatbots/:chatbotId/facebook-pages', requirePermission('chatbot_channels_manage'), chatbotController.getFacebookPagesForChatbot.bind(chatbotController));
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
router.get('/inbox/channels', requirePermission('inbox_view'), unifiedInboxController.getAvailableChannels.bind(unifiedInboxController));
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
router.post('/inbox/read-all', requirePermission('inbox_view'), unifiedInboxController.markAllAsRead.bind(unifiedInboxController));
router.delete('/inbox/conversations/:id', requirePermission('inbox_manage'), unifiedInboxController.deleteConversation.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/ai-pause', requirePermission('inbox_manage'), unifiedInboxController.setAiPaused.bind(unifiedInboxController));
router.get('/inbox/unread-count', requirePermission('inbox_view'), unifiedInboxController.getUnreadCount.bind(unifiedInboxController));
// Vé SSE: đứng SAU authMiddleware (cần Bearer + X-Owner-Context) và đúng quyền xem hộp thư. Dùng chung sseLimiter
// với luồng nối (khoá theo user vì authMiddleware đã gắn req.user).
router.post('/inbox/stream-ticket', requirePermission('inbox_view'), sseLimiter, unifiedInboxController.createStreamTicket.bind(unifiedInboxController));

// ── AI Activity Report & Summaries ──────────────────────────────────
router.get('/inbox/ai-activity', requirePermission('inbox_view'), aiActivityController.getActivityReport.bind(aiActivityController));
router.post('/inbox/ai-activity/resume-all', requirePermission('inbox_manage'), aiActivityController.resumeAllAi.bind(aiActivityController));
router.post(
  '/inbox/ai-activity/summarize',
  requireSelfContext,
  // D-21: đọc cache TRƯỚC cổng credit — hết credit vẫn xem lại được bản đã trả tiền.
  aiActivityController.serveCachedSummary.bind(aiActivityController),
  assertAiCreditAvailable('inbox_ai_summary'),
  aiActivityController.summarizeActivity.bind(aiActivityController)
);

// ── Chatbot Contact Alerts ─────────────────────────────────────────
router.get('/inbox/contact-alerts', requirePermission('inbox_view'), chatbotContactAlertController.listAlerts.bind(chatbotContactAlertController));
router.post('/inbox/contact-alerts/:id/handled', requirePermission('inbox_reply'), chatbotContactAlertController.markHandled.bind(chatbotContactAlertController));
router.delete('/inbox/contact-alerts/:id/handled', requirePermission('inbox_reply'), chatbotContactAlertController.unmarkHandled.bind(chatbotContactAlertController));
router.get('/inbox/contact-alerts/settings', requirePermission('inbox_view'), chatbotContactAlertController.getSettings.bind(chatbotContactAlertController));
router.put('/inbox/contact-alerts/settings', requirePermission('inbox_manage'), chatbotContactAlertController.updateSettings.bind(chatbotContactAlertController));

// ── Zalo Personal Account Chatbot Settings ─────────────────────────

router.post('/zalo-account/:zaloSettingId/chatbot/toggle', requirePermission('chatbot_channels_manage'), chatbotController.toggleZaloAccountChatbot.bind(chatbotController));
router.get('/zalo-accounts/chatbot', requirePermission('chatbot_channels_manage'), chatbotController.listZaloAccountsWithChatbotSettings.bind(chatbotController));

// ── WhatsApp per-chatbot enable (DeployTab modal) ─────────────────────
// GET: list Cloud API + Baileys WhatsApp accounts của user.
// POST: toggle AI cho 1 account (body: session_key | id_channel_connection).
router.get('/whatsapp-accounts/chatbot', requirePermission('chatbot_channels_manage'), chatbotController.listWhatsAppAccountsWithChatbotSettings.bind(chatbotController));
router.post('/whatsapp-account/chatbot/toggle', requirePermission('chatbot_channels_manage'), chatbotController.toggleWhatsAppAccountChatbot.bind(chatbotController));
// Giữ route cũ để client cũ không vỡ — nó đọc id từ URL nhưng dispatch tới body.
router.post('/whatsapp-account/:channelConnectionId/chatbot/toggle', requirePermission('chatbot_channels_manage'), chatbotController.toggleWhatsAppAccountChatbot.bind(chatbotController));

// ── Telegram Personal (QR login via Python telegram-gateway) ────────────

router.post('/telegram-accounts/init', requirePermission('chatbot_channels_manage'), chatbotController.initTelegramLogin.bind(chatbotController));
router.get('/telegram-accounts/status/:sessionId', requirePermission('chatbot_channels_manage'), chatbotController.checkTelegramLoginStatus.bind(chatbotController));
router.delete('/telegram-accounts/login/:sessionId', requirePermission('chatbot_channels_manage'), chatbotController.cancelTelegramLogin.bind(chatbotController));
router.get('/telegram-accounts', requirePermission('chatbot_channels_manage'), chatbotController.listTelegramAccounts.bind(chatbotController));
router.delete('/telegram-accounts/:id', requirePermission('chatbot_channels_manage'), chatbotController.deleteTelegramAccount.bind(chatbotController));
router.post('/telegram-accounts/:id/logout', requirePermission('chatbot_channels_manage'), chatbotController.logoutTelegramAccount.bind(chatbotController));
router.get('/telegram-accounts/chatbot', requirePermission('chatbot_channels_manage'), chatbotController.listTelegramAccountsWithChatbotSettings.bind(chatbotController));
router.post('/telegram-account/chatbot/toggle', requirePermission('chatbot_channels_manage'), chatbotController.toggleTelegramAccountChatbot.bind(chatbotController));

// Cheap status endpoint the UI calls on page load to decide whether
// to disable the "Connect account" button instead of waiting for a
// 503. Returns the same shape `getState()` exposes internally.
router.get('/personal-account-status/:channel', requirePermission('chatbot_channels_manage'), chatbotController.getPersonalAccountStatus.bind(chatbotController));

// Multi-channel status endpoint. The FE poll loop hits this one
// route instead of two — cheaper when both banners are visible,
// and the response carries an `allHealthy` flag so the FE can stop
// polling with a single boolean check.
router.get('/personal-accounts-health', requirePermission('chatbot_channels_manage'), chatbotController.getPersonalAccountsHealth.bind(chatbotController));

// ── Outbox ───────────────────────────────────────────────────────

router.get('/inbox/outbox', requirePermission('inbox_view'), unifiedInboxController.getOutboxMessages.bind(unifiedInboxController));
router.get('/inbox/outbox/:id', requirePermission('inbox_view'), unifiedInboxController.getOutboxMessage.bind(unifiedInboxController));

// ── Zalo Personal Sync ───────────────────────────────────────────

router.get('/zalo-personal/sync', requirePermission('inbox_manage'), zaloPersonalSyncController.sync.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/contacts', requirePermission('inbox_manage'), zaloPersonalSyncController.syncContacts.bind(zaloPersonalSyncController));
router.get('/zalo-personal/sync/status', requirePermission('inbox_view'), zaloPersonalSyncController.getSyncStatus.bind(zaloPersonalSyncController));
router.post('/zalo-personal/sync/chat-history', requirePermission('inbox_manage'), zaloPersonalSyncController.syncChatHistory.bind(zaloPersonalSyncController));
router.get('/zalo-personal/friends', requirePermission('inbox_view'), zaloPersonalSyncController.getFriends.bind(zaloPersonalSyncController));

export default router;
