import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

// Generate campaign script from AI
router.post('/generate-campaign', aiController.generateCampaign.bind(aiController));

// Create and optionally run the campaign
router.post('/execute-campaign', aiController.executeCampaign.bind(aiController));

export default router;
