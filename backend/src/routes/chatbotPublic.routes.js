import express from 'express';
import { publicCorsMiddleware } from '../middleware/dynamicCors.middleware.js';
import chatbotController from '../controllers/chatbot.controller.js';

const router = express.Router();

// Apply CORS to all routes in this router
router.use(publicCorsMiddleware);

// ── Public Web Widget API (no auth required) ─────────────────────

// Get widget configuration
router.get('/widget/:widgetKey/config', chatbotController.getWidgetConfig.bind(chatbotController));

// Start / resume web chat conversation
router.post('/widget/conversations', chatbotController.startWebChat.bind(chatbotController));

// Get messages in a conversation
router.get('/widget/conversations/:conversationId/messages', chatbotController.getWebChatMessages.bind(chatbotController));

// Send a message in a conversation
router.post('/widget/conversations/:conversationId/messages', chatbotController.sendWebChatMessage.bind(chatbotController));

// ── Custom AI Chat Widget (uses /api/ai/custom-chat) ─────────────────────

// Get custom chatbot config by ID (public)
router.get('/chatbot/:chatbotId', chatbotController.getPublicChatbotById.bind(chatbotController));

// Get custom chatbot config by widget_key
router.get('/custom-chatbot/:widgetKey', chatbotController.getCustomChatbotConfig.bind(chatbotController));

// Get documents for a chatbot
router.get('/custom-chatbot/:chatbotId/documents', chatbotController.getCustomChatbotDocuments.bind(chatbotController));

// Send message to custom chatbot (directly uses Gemini + KB)
router.post('/custom-chatbot/:widgetKey/chat', chatbotController.chatWithCustomChatbot.bind(chatbotController));

export default router;
