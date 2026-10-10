import express from 'express';
import multer from 'multer';
import { allowAllCorsMiddleware } from '../middleware/dynamicCors.middleware.js';
import chatbotController from '../controllers/chatbot.controller.js';
import {
  publicChatLimiter,
  publicUploadLimiter,
  publicChatPollIpLimiter,
  publicChatPollSessionLimiter,
} from '../middleware/rateLimiter.middleware.js';
import { MAX_PUBLIC_UPLOAD_FILE_BYTES, MAX_PUBLIC_UPLOAD_FILE_MB } from '../utils/uploadLimits.util.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { getStoragePaths } from '../utils/storageCapacity.util.js';

const router = express.Router();
const multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PUBLIC_UPLOAD_FILE_BYTES } });
// Đường công khai (không đăng nhập): trần 20 MB, quá trần trả 413 kèm câu tiếng Việt nêu đúng con số (widget hiện nguyên `message`).
const upload = {
  single: (field) => (req, res, next) => multerUpload.single(field)(req, res, (err) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: `Tệp quá lớn. Vui lòng gửi tệp dưới ${MAX_PUBLIC_UPLOAD_FILE_MB}MB.`,
        code: 'FILE_TOO_LARGE',
      });
    }
    return next(err);
  }),
};
const workspaceUploadCapacityGuard = storageCapacityGuard({ paths: [getStoragePaths().uploads] });

// Apply allow-all CORS to all routes (for widget/iframe embedding)
router.use(allowAllCorsMiddleware);

// ── Public Web Widget API (no auth required) ─────────────────────

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

// Tin nhân viên trả lời tay mới cho khách (widget poll 8 giây/lần khi khung chat mở). Phạm vi theo sessionId + chatbot, chỉ role
// 'agent'. Đi qua bộ giới hạn RIÊNG (globalLimiter bỏ qua đường này — xem isPublicChatPollPath).
router.get(
  '/custom-chatbot/:widgetKey/messages',
  publicChatPollIpLimiter,
  publicChatPollSessionLimiter,
  chatbotController.getPublicAgentMessages.bind(chatbotController)
);
router.get(
  '/custom-chatbot/id/:chatbotId/messages',
  publicChatPollIpLimiter,
  publicChatPollSessionLimiter,
  chatbotController.getPublicAgentMessagesById.bind(chatbotController)
);

// Chat attachment upload (visitor) — rate limit before multer; gates inside controller
router.post(
  '/custom-chatbot/:widgetKey/attachment',
  publicUploadLimiter,
  workspaceUploadCapacityGuard,
  upload.single('file'),
  chatbotController.uploadPublicChatAttachment.bind(chatbotController)
);
router.delete(
  '/custom-chatbot/:widgetKey/attachment',
  publicChatLimiter,
  chatbotController.deletePublicChatAttachment.bind(chatbotController)
);
router.post(
  '/custom-chatbot/id/:chatbotId/attachment',
  publicUploadLimiter,
  workspaceUploadCapacityGuard,
  upload.single('file'),
  chatbotController.uploadPublicChatAttachmentById.bind(chatbotController)
);
router.delete(
  '/custom-chatbot/id/:chatbotId/attachment',
  publicChatLimiter,
  chatbotController.deletePublicChatAttachmentById.bind(chatbotController)
);

export default router;
