import express from 'express';
import { allowAllCorsMiddleware } from '../middleware/dynamicCors.middleware.js';
import chatbotController from '../controllers/chatbot.controller.js';
import { publicChatLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// Apply allow-all CORS to all routes (for widget/iframe embedding)
router.use(allowAllCorsMiddleware);

// ── Public Web Widget API (no auth required) ─────────────────────

// Get widget configuration
router.get('/widget/:widgetKey/config', chatbotController.getWidgetConfig.bind(chatbotController));

// NOTE: /widget/conversations* routes were removed (orphan + IDOR). Live widget uses
// /custom-chatbot/:widgetKey/* with sessionId scoping. See PLAN_FIX_CHATBOT_INBOX Phase 1.

// ── Custom AI Chat Widget (uses /api/ai/custom-chat) ─────────────────────

// Get custom chatbot config by ID (public)
router.get('/chatbot/:chatbotId', chatbotController.getPublicChatbotById.bind(chatbotController));

// Get custom chatbot config by widget_key
router.get('/custom-chatbot/:widgetKey', chatbotController.getCustomChatbotConfig.bind(chatbotController));

// Alternative: /custom-chatbot/:widgetKey/config (for widget.js)
router.get('/custom-chatbot/:widgetKey/config', chatbotController.getCustomChatbotConfig.bind(chatbotController));

// Send message to custom chatbot (directly uses Gemini + KB)
router.post('/custom-chatbot/:widgetKey/chat', publicChatLimiter, chatbotController.chatWithCustomChatbot.bind(chatbotController));

// Alternative: chat by ID (not widgetKey) - for PublicChatbotPage
router.post('/custom-chatbot/id/:chatbotId/chat', publicChatLimiter, chatbotController.chatWithCustomChatbotById.bind(chatbotController));

// Get messages for polling agent replies (requires sessionId)
router.get('/custom-chatbot/id/:chatbotId/messages', chatbotController.getChatMessages.bind(chatbotController));

export default router;
