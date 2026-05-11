import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Smart interactive chat
router.post('/chat', aiController.chat.bind(aiController));

// Generate campaign script from AI
router.post('/generate-campaign', aiController.generateCampaign.bind(aiController));

// Create and optionally run the campaign
router.post('/execute-campaign', aiController.executeCampaign.bind(aiController));

// Business profile (RAG context)
router.get('/business-profile', aiController.getBusinessProfile.bind(aiController));
router.put('/business-profile', aiController.saveBusinessProfile.bind(aiController));

export default router;
