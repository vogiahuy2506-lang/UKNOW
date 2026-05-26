import express from 'express';
import chatbotController from '../controllers/chatbot.controller.js';
import unifiedInboxController from '../controllers/unifiedInbox.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// ── Channel Connections ──────────────────────────────────────────

router.get('/channels', chatbotController.listChannels.bind(chatbotController));
router.post('/channels/connect/zalo-oa', chatbotController.connectZaloOA.bind(chatbotController));
router.post('/channels/connect/facebook', chatbotController.connectFacebook.bind(chatbotController));
router.delete('/channels/:channel', chatbotController.disconnectChannel.bind(chatbotController));

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

export default router;
