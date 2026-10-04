import express from 'express';
import heroConsultationService, { HERO_INVALID_INPUT_MESSAGE } from '../services/heroConsultation.service.js';
import { allowAllCorsMiddleware } from '../middleware/dynamicCors.middleware.js';
import { publicChatLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

const MAX_VISITOR_ID_CHARS = 128;

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
 *   - visitorId: string - Unique visitor identifier (<= 128 chars)
 *   - message: string - User's message (<= 1.000 chars, longer -> 400 MESSAGE_TOO_LONG)
 *   - history: BỎ QUA. Giao diện không gửi; nhận từ client chỉ là bề mặt tấn công (chèn lượt "Trợ lý" giả để
 *     bot "xác nhận" khuyến mãi, hoặc nhồi prompt để đốt tiền Gemini) — D-01/D-14, 03/10/2026.
 *
 * Response:
 *   - success: boolean
 *   - reply?: string - AI's response
 *   - chatsUsed?: number - Number of chats used
 *   - code?: string - Error code if failed
 *   - message?: string - Error message if failed
 */
router.post('/consultation', publicChatLimiter, async (req, res) => {
  try {
    const { visitorId, message } = req.body || {};
    const clientIp = (req.ip || req.socket?.remoteAddress || '').trim();

    // Kiểu + độ dài: visitorId làm khoá Redis, message vào thẳng prompt. Phải là chuỗi (trước đây
    // `visitorId?.trim()` ném TypeError → 500 khi client gửi số/đối tượng).
    if (
      typeof visitorId !== 'string' || !visitorId.trim() || visitorId.length > MAX_VISITOR_ID_CHARS
      || typeof message !== 'string' || !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: HERO_INVALID_INPUT_MESSAGE,
      });
    }

    const result = await heroConsultationService.processChat({
      visitorId: visitorId.trim(),
      message: message.trim(),
      ip: clientIp,
    });

    if (!result.success) {
      // QUOTA_EXCEEDED / BUSY là từ chối "mềm": giao diện đọc `code`/`message` để hiện câu cho khách, nên trả 200.
      const statusCode = result.code === 'QUOTA_EXCEEDED' || result.code === 'BUSY' ? 200 : 400;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('[HeroConsultation Route] Error:', error);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại.',
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
      message: 'Không lấy được thông tin trợ lý. Vui lòng thử lại.',
    });
  }
});

export default router;
