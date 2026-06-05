import express from 'express';
import jwt from 'jsonwebtoken';
import chatbotController from '../controllers/chatbot.controller.js';
import unifiedInboxController from '../controllers/unifiedInbox.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import sseService from '../services/sse.service.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── SSE Stream (parse JWT from query param for SSE compatibility) ───
router.get('/inbox/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if present
  
  // Parse JWT token from query param (EventSource doesn't support headers)
  const token = req.query.token;
  if (!token) {
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({ success: false, message: 'Invalid token' });
    return;
  }

  // Token uses userIdentifier, nameidentifier (Microsoft), or userId depending on how it was created
  // Microsoft-style tokens use URL-formatted keys
  const userIdentifierClaim = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
  const userId = decoded.userId || decoded.userIdentifier || decoded.nameidentifier || decoded[userIdentifierClaim];
  if (!userId) {
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({ success: false, message: 'Invalid token - no userId' });
    return;
  }

  // Send initial connection message
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', userId })}\n\n`);
  
  // Register client
  sseService.addClient(userId, res);
  
  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);
  
  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    sseService.removeClient(userId, res);
  });
});

router.use(authMiddleware);

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
router.get('/custom-chatbots/:chatbotId', chatbotController.getSubAssistant.bind(chatbotController));
router.put('/custom-chatbots/:chatbotId', chatbotController.updateCustomChatbot.bind(chatbotController));
router.delete('/custom-chatbots/:chatbotId', chatbotController.deleteCustomChatbot.bind(chatbotController));

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

// Web Chat (visitor-facing, no auth)
router.get('/widgets/:widgetKey/start', chatbotController.startWebChat.bind(chatbotController));
router.get('/widgets/conversations/:conversationId/messages', chatbotController.getWebChatMessages.bind(chatbotController));
router.post('/widgets/conversations/:conversationId/messages', chatbotController.sendWebChatMessage.bind(chatbotController));

// ── Unified Inbox ────────────────────────────────────────────────

router.get('/inbox/conversations', unifiedInboxController.getConversations.bind(unifiedInboxController));
router.get('/inbox/conversations/:id', unifiedInboxController.getConversation.bind(unifiedInboxController));
router.get('/inbox/conversations/:id/messages', unifiedInboxController.getMessages.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/messages', unifiedInboxController.sendMessage.bind(unifiedInboxController));
router.post('/inbox/conversations/:id/read', unifiedInboxController.markAsRead.bind(unifiedInboxController));
router.get('/inbox/unread-count', unifiedInboxController.getUnreadCount.bind(unifiedInboxController));

// ── Outbox ───────────────────────────────────────────────────────

router.get('/inbox/outbox', unifiedInboxController.getOutboxMessages.bind(unifiedInboxController));
router.get('/inbox/outbox/:id', unifiedInboxController.getOutboxMessage.bind(unifiedInboxController));

export default router;
