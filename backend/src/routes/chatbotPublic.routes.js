import express from 'express';
import chatbotController from '../controllers/chatbot.controller.js';

const router = express.Router();

// ── Public Web Widget API (no auth required) ─────────────────────

// Get widget configuration
router.get('/widget/:widgetKey/config', chatbotController.getWidgetConfig.bind(chatbotController));

// Start / resume web chat conversation
router.post('/widget/conversations', chatbotController.startWebChat.bind(chatbotController));

// Get messages in a conversation
router.get('/widget/conversations/:conversationId/messages', chatbotController.getWebChatMessages.bind(chatbotController));

// Send a message in a conversation
router.post('/widget/conversations/:conversationId/messages', chatbotController.sendWebChatMessage.bind(chatbotController));

export default router;
