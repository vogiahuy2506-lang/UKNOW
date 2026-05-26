import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Smart interactive chat
router.post('/chat', aiController.chat.bind(aiController));

// Smart interactive chat V2 - multi-step support
router.post('/chat-v2', aiController.chatV2.bind(aiController));

// Generate campaign script from AI (legacy)
router.post('/generate-campaign', aiController.generateCampaign.bind(aiController));

// Generate campaign with Registry support (multi-step in 1 node)
router.post('/generate-campaign-v2', aiController.generateCampaignV2.bind(aiController));

// Generate full landing page HTML (Tailwind CDN + business context)
router.post('/generate-landing-html', aiController.generateLandingHtml.bind(aiController));

// Create and optionally run the campaign
router.post('/execute-campaign', aiController.executeCampaign.bind(aiController));

// Create campaign from AI draft (NO auto-run)
router.post('/create-from-draft', aiController.createCampaignFromDraft.bind(aiController));

// Push AI script to existing campaign
router.post('/push-to-campaign/:id', aiController.pushToCampaign.bind(aiController));

// Create AND RUN campaign automatically (no confirmation needed)
router.post('/create-and-run-campaign', aiController.createAndRunCampaign.bind(aiController));

// Business profile (RAG context)
router.get('/business-profile', aiController.getBusinessProfile.bind(aiController));
router.put('/business-profile', aiController.saveBusinessProfile.bind(aiController));

// Chat sessions (multi-session history)
router.get('/sessions', aiController.getSessions.bind(aiController));
router.get('/sessions/:id/messages', aiController.getSessionMessages.bind(aiController));
router.delete('/sessions/:id', aiController.deleteSession.bind(aiController));

export default router;
