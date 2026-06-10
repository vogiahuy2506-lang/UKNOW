import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimiter.middleware.js';
import multer from 'multer';
import usageTrackingService from '../services/payment/usageTracking.service.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);

const aiCreditMeter = async (req, res, next) => {
  try {
    await usageTrackingService.ensureAvailable(req.user.id, 'ai_credit', 1);
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
        usageTrackingService.incrementUsage(req.user.id, 'ai_credit', 1)
          .catch(err => console.warn('[AI Credit] Failed to track usage:', err.message));
      }
      return originalJson(body);
    };
    next();
  } catch (err) {
    return res.status(err.status || 403).json({
      success: false,
      message: err.message || 'Đã hết credit AI trong gói dịch vụ hiện tại',
      code: err.code || 'AI_CREDIT_LIMIT_EXCEEDED',
      resource: err.resource || 'ai_credit',
      used: err.used,
      limit: err.limit,
      upgradeRequired: true,
    });
  }
};

// Smart interactive chat
router.post('/chat', aiLimiter, aiCreditMeter, aiController.chat.bind(aiController));

// Smart interactive chat V2 - multi-step support
router.post('/chat-v2', aiLimiter, aiCreditMeter, aiController.chatV2.bind(aiController));

// Generate campaign script from AI (legacy)
router.post('/generate-campaign', aiLimiter, aiCreditMeter, aiController.generateCampaign.bind(aiController));

// Generate campaign with Registry support (multi-step in 1 node)
router.post('/generate-campaign-v2', aiLimiter, aiCreditMeter, aiController.generateCampaignV2.bind(aiController));

// Generate full landing page HTML (Tailwind CDN + business context)
router.post('/generate-landing-html', aiLimiter, aiCreditMeter, aiController.generateLandingHtml.bind(aiController));

// Create and optionally run the campaign
router.post('/execute-campaign', aiLimiter, aiCreditMeter, aiController.executeCampaign.bind(aiController));

// Create campaign from AI draft (NO auto-run)
router.post('/create-from-draft', aiLimiter, aiCreditMeter, aiController.createCampaignFromDraft.bind(aiController));

// Push AI script to existing campaign
router.post('/push-to-campaign/:id', aiLimiter, aiCreditMeter, aiController.pushToCampaign.bind(aiController));

// Create AND RUN campaign automatically (no confirmation needed)
router.post('/create-and-run-campaign', aiLimiter, aiCreditMeter, aiController.createAndRunCampaign.bind(aiController));

// Business profile (RAG context)
router.get('/business-profile', aiController.getBusinessProfile.bind(aiController));
router.put('/business-profile', aiController.saveBusinessProfile.bind(aiController));

// Chat sessions (multi-session history)
router.get('/sessions', aiController.getSessions.bind(aiController));
router.get('/sessions/:id/messages', aiController.getSessionMessages.bind(aiController));
router.delete('/sessions/:id', aiController.deleteSession.bind(aiController));

// Custom AI Chatbot (for widget, Zalo OA, Facebook, Studio chat)
router.post('/custom-chat', aiLimiter, aiController.customChat.bind(aiController));

// Custom AI - Document upload (extract, chunk, embed)
router.post('/custom-chat/upload', upload.single('file'), aiController.customChatUpload.bind(aiController));

// Custom AI - Logo image upload (2MB limit)
router.post('/custom-chat/logo', upload.single('file'), aiController.customChatLogoUpload.bind(aiController));

// Custom AI - Get documents
router.get('/custom-chat/documents/:chatbotId', aiController.getCustomChatbotDocuments.bind(aiController));
router.delete('/custom-chat/documents/:chatbotId/:docId', aiController.deleteCustomChatbotDocument.bind(aiController));
router.post('/custom-chat/text/:chatbotId', aiController.addCustomChatTextDocument.bind(aiController));

export default router;
