import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimiter.middleware.js';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

// Smart interactive chat
router.post('/chat', aiLimiter, aiController.chat.bind(aiController));

// Smart interactive chat V2 - multi-step support
router.post('/chat-v2', aiLimiter, aiController.chatV2.bind(aiController));

// Generate campaign script from AI (legacy)
router.post('/generate-campaign', aiLimiter, aiController.generateCampaign.bind(aiController));

// Generate campaign with Registry support (multi-step in 1 node)
router.post('/generate-campaign-v2', aiLimiter, aiController.generateCampaignV2.bind(aiController));

// Generate full landing page HTML (Tailwind CDN + business context)
router.post('/generate-landing-html', aiLimiter, aiController.generateLandingHtml.bind(aiController));

// Create and optionally run the campaign
router.post('/execute-campaign', aiLimiter, aiController.executeCampaign.bind(aiController));

// Create campaign from AI draft (NO auto-run)
router.post('/create-from-draft', aiLimiter, aiController.createCampaignFromDraft.bind(aiController));

// Push AI script to existing campaign
router.post('/push-to-campaign/:id', aiLimiter, aiController.pushToCampaign.bind(aiController));

// Create AND RUN campaign automatically (no confirmation needed)
router.post('/create-and-run-campaign', aiLimiter, aiController.createAndRunCampaign.bind(aiController));

// Business profile (RAG context)
router.get('/allowed-models', aiController.getAllowedModels.bind(aiController));
router.put('/preferred-model', aiController.savePreferredModel.bind(aiController));
router.get('/business-profile', aiController.getBusinessProfile.bind(aiController));
router.put('/business-profile', aiController.saveBusinessProfile.bind(aiController));

// Chat sessions (multi-session history)
router.get('/sessions', aiController.getSessions.bind(aiController));
router.get('/sessions/:id/messages', aiController.getSessionMessages.bind(aiController));
router.delete('/sessions/:id', aiController.deleteSession.bind(aiController));

// Custom AI Chatbot (for widget, Zalo OA, Facebook, Studio chat)
router.post('/custom-chat', aiLimiter, aiController.customChat.bind(aiController));

// Chatbot Studio Conversations
router.get('/chatbot-studio/conversations', aiController.getChatbotStudioConversations.bind(aiController));
router.get('/chatbot-studio/conversations/:id', aiController.getChatbotStudioConversation.bind(aiController));
router.get('/chatbot-studio/conversations/:id/messages', aiController.getChatbotStudioMessages.bind(aiController));
router.post('/chatbot-studio/conversations', aiController.createChatbotStudioConversation.bind(aiController));
router.post('/chatbot-studio/conversations/:id/messages', aiController.addChatbotStudioMessage.bind(aiController));
router.delete('/chatbot-studio/conversations/:id', aiController.deleteChatbotStudioConversation.bind(aiController));
router.delete('/chatbot-studio/conversations/:id/messages', aiController.clearChatbotStudioConversation.bind(aiController));

// Custom AI - Document upload (extract, chunk, embed)
router.post('/custom-chat/upload', upload.single('file'), aiController.customChatUpload.bind(aiController));

// Custom AI - Logo image upload (2MB limit)
router.post('/custom-chat/logo', upload.single('file'), aiController.customChatLogoUpload.bind(aiController));

// Custom AI - Get documents
router.get('/custom-chat/documents/:chatbotId', aiController.getCustomChatbotDocuments.bind(aiController));
router.delete('/custom-chat/documents/:chatbotId/:docId', aiController.deleteCustomChatbotDocument.bind(aiController));
router.post('/custom-chat/text/:chatbotId', aiController.addCustomChatTextDocument.bind(aiController));

export default router;
