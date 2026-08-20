import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { aiLimiter, uploadLimiter } from '../middleware/rateLimiter.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import { requireActivePlan, requirePasswordChange, requirePermission, requireAllPermissions, requireSelfContext } from '../middleware/authorization.middleware.js';
import multer from 'multer';
import { MAX_UPLOAD_FILE_BYTES } from '../utils/uploadLimits.util.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { getStoragePaths } from '../utils/storageCapacity.util.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_BYTES } });
const workspaceUploadCapacityGuard = storageCapacityGuard({ paths: [getStoragePaths().uploads] });

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Smart interactive chat
router.post('/chat', aiLimiter, assertAiCreditAvailable('ai_assistant_chat'), aiController.chat.bind(aiController));

// Smart interactive chat V2 - multi-step support
router.post('/chat-v2', aiLimiter, assertAiCreditAvailable('ai_assistant_chat_v2'), aiController.chatV2.bind(aiController));

// Generate campaign script from AI (legacy)
router.post('/generate-campaign', aiLimiter, requirePermission('campaigns_create'), assertAiCreditAvailable('ai_generate_campaign'), aiController.generateCampaign.bind(aiController));

// Generate campaign with Registry support (multi-step in 1 node)
router.post('/generate-campaign-v2', aiLimiter, requirePermission('campaigns_create'), assertAiCreditAvailable('ai_generate_campaign_v2'), aiController.generateCampaignV2.bind(aiController));

// Generate full landing page HTML (Tailwind CDN + business context)
router.post('/generate-landing-html', aiLimiter, requirePermission('landing_pages'), assertAiCreditAvailable('ai_generate_landing_html'), aiController.generateLandingHtml.bind(aiController));

// Edit existing landing page HTML (Tailwind CDN + preserve untouched sections)
router.post('/edit-landing-html', aiLimiter, requirePermission('landing_pages'), assertAiCreditAvailable('ai_edit_landing_html'), aiController.editLandingHtml.bind(aiController));

// Create and optionally run the campaign
router.post('/execute-campaign', aiLimiter, requirePermission('campaigns_create'), aiController.executeCampaign.bind(aiController));

// Create campaign from AI draft (NO auto-run)
router.post('/create-from-draft', aiLimiter, requirePermission('campaigns_create'), aiController.createCampaignFromDraft.bind(aiController));

// Read-only, deterministic campaign preview before the user creates a draft.
router.post('/prepare-campaign', aiLimiter, requirePermission('campaigns_view'), aiController.prepareCampaign.bind(aiController));

// Push AI script to existing campaign
router.post('/push-to-campaign/:id', aiLimiter, requirePermission('campaigns_create'), aiController.pushToCampaign.bind(aiController));

// Create AND RUN campaign automatically (no confirmation needed)
router.post('/create-and-run-campaign', aiLimiter, requireAllPermissions(['campaigns_create', 'campaigns_run']), aiController.createAndRunCampaign.bind(aiController));

// Business profile (RAG context)
router.get('/allowed-models', aiController.getAllowedModels.bind(aiController));
router.put('/preferred-model', aiController.savePreferredModel.bind(aiController));
router.get('/business-profile', requireSelfContext, aiController.getBusinessProfile.bind(aiController));
router.put('/business-profile', requireSelfContext, aiController.saveBusinessProfile.bind(aiController));

// Chat sessions (multi-session history)
router.get('/sessions', aiController.getSessions.bind(aiController));
router.get('/sessions/:id/messages', aiController.getSessionMessages.bind(aiController));
router.delete('/sessions/:id', aiController.deleteSession.bind(aiController));
// Wizard state mutation tß╗½ n├║t bß║Ñm (kh├┤ng gß╗ìi AI ΓåÆ kh├┤ng aiLimiter, kh├┤ng credit)
router.patch('/sessions/:id/wizard-state', aiController.patchWizardState.bind(aiController));

// Custom AI Chatbot (for widget, Zalo OA, Facebook, Studio chat)
router.post('/custom-chat', requireSelfContext, aiLimiter, assertAiCreditAvailable('ai_custom_chat'), aiController.customChat.bind(aiController));

// Chat attachment for Studio (per-turn; NOT knowledge base)
router.post(
  '/chat-attachment',
  requireSelfContext,
  uploadLimiter,
  workspaceUploadCapacityGuard,
  upload.single('file'),
  aiController.uploadChatAttachment.bind(aiController)
);
router.delete(
  '/chat-attachment',
  requireSelfContext,
  aiLimiter,
  aiController.deleteChatAttachment.bind(aiController)
);

// Chatbot Studio Conversations
router.get('/chatbot-studio/conversations', requireSelfContext, aiController.getChatbotStudioConversations.bind(aiController));
router.get('/chatbot-studio/conversations/:id', requireSelfContext, aiController.getChatbotStudioConversation.bind(aiController));
router.get('/chatbot-studio/conversations/:id/messages', requireSelfContext, aiController.getChatbotStudioMessages.bind(aiController));
router.post('/chatbot-studio/conversations', requireSelfContext, aiController.createChatbotStudioConversation.bind(aiController));
router.post('/chatbot-studio/conversations/:id/messages', requireSelfContext, aiController.addChatbotStudioMessage.bind(aiController));
router.delete('/chatbot-studio/conversations/:id', requireSelfContext, aiController.deleteChatbotStudioConversation.bind(aiController));
router.delete('/chatbot-studio/conversations/:id/messages', requireSelfContext, aiController.clearChatbotStudioConversation.bind(aiController));

// Custom AI - Document upload (extract, chunk, embed)
router.post('/custom-chat/upload', requireSelfContext, upload.single('file'), aiController.customChatUpload.bind(aiController));

// Custom AI - Logo image upload
router.post('/custom-chat/logo', requireSelfContext, upload.single('file'), aiController.customChatLogoUpload.bind(aiController));

// Custom AI - Get documents
router.get('/custom-chat/documents/:chatbotId', requireSelfContext, aiController.getCustomChatbotDocuments.bind(aiController));
router.delete('/custom-chat/documents/:chatbotId/:docId', requireSelfContext, aiController.deleteCustomChatbotDocument.bind(aiController));
router.post('/custom-chat/text/:chatbotId', requireSelfContext, aiController.addCustomChatTextDocument.bind(aiController));

export default router;
