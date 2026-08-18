import express from 'express';
import heroConsultationService from '../services/heroConsultation.service.js';
import { allowAllCorsMiddleware } from '../middleware/dynamicCors.middleware.js';

const router = express.Router();

// Apply allow-all CORS for public access
router.use(allowAllCorsMiddleware);

/**
 * POST /api/public/hero/consultation
 *
 * Send a chat message to the hero consultation chatbot (no auth required)
 * This is for customer consultation on the hero/landing page
 * Different from /app chatbot which uses RAG and credit system
 *
 * Request body:
 *   - visitorId: string - Unique visitor identifier
 *   - message: string - User's message
 *   - history?: Array<{role: 'user'|'assistant', content: string}> - Previous messages
 *
 * Response:
 *   - success: boolean
 *   - reply?: string - AI's response
 *   - chatsUsed?: number - Number of chats used
 *   - code?: string - Error code if failed
 *   - message?: string - Error message if failed
 */
router.post('/consultation', async (req, res) => {
  try {
    const { visitorId, message, history } = req.body;

    if (!visitorId?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'visitorId and message are required',
      });
    }

    const result = await heroConsultationService.processChat({
      visitorId: visitorId.trim(),
      message: message.trim(),
      history: Array.isArray(history) ? history : [],
    });

    if (!result.success) {
      const statusCode = result.code === 'QUOTA_EXCEEDED' ? 200 : 400;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[HeroConsultation Route] Error:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * GET /api/public/hero/info
 *
 * Get hero consultation chatbot info for the landing page
 *
 * Response:
 *   - chatbotId: string
 *   - chatbotName: string
 *   - welcomeMessage: string
 */
router.get('/info', (req, res) => {
  try {
    const info = heroConsultationService.getChatbotInfo();
    return res.json({
      success: true,
      ...info,
    });
  } catch (error) {
    console.error('[HeroConsultation Route] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get chatbot info',
    });
  }
});

export default router;
