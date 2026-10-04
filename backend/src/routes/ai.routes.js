import express from 'express';
import aiController from '../controllers/ai.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { aiLimiter, uploadLimiter } from '../middleware/rateLimiter.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import { attachToExistingLandingTurn } from '../services/ai/aiLandingTurn.service.js';
import { requireActivePlan, requirePasswordChange, requirePhone, requirePermission, requireAllPermissions, requireSelfContext } from '../middleware/authorization.middleware.js';
import multer from 'multer';
import { MAX_UPLOAD_FILE_BYTES } from '../utils/uploadLimits.util.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { channelEntitlementContext } from '../middleware/channelEntitlement.middleware.js';
import { getStoragePaths } from '../utils/storageCapacity.util.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_BYTES } });
const workspaceUploadCapacityGuard = storageCapacityGuard({ paths: [getStoragePaths().uploads] });

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);

// Smart interactive chat
router.post('/chat', aiLimiter, requirePermission('ai_assistant_use'), channelEntitlementContext, assertAiCreditAvailable('ai_assistant_chat'), aiController.chat.bind(aiController));

// Generate full landing page HTML (Tailwind CDN + business context)
// PR-9 (B-4): trả phản hồi LUỒNG (NDJSON, có nhịp ping) khi client xin `Accept: application/x-ndjson`, kèm `requestId` chống trừ 2 lần.
// `attachToExistingLandingTurn` đứng TRƯỚC bước kiểm credit: bấm lại cùng requestId thì bám vào lượt cũ / nhận kết quả đã trả tiền,
// không bị chặn "hết credit" chỉ vì lượt đầu vừa trừ xong credit cuối cùng.
router.post('/generate-landing-html', aiLimiter, requirePermission('landing_pages'), attachToExistingLandingTurn('generate'), assertAiCreditAvailable('ai_generate_landing_html'), aiController.generateLandingHtml.bind(aiController));

// "AI viết hộ" chỉ dẫn hệ thống cho chatbot (PLAN_AI_VIET_HO_CHI_DAN_CHATBOT_2026-09-13.md)
router.post('/generate-system-instruction', aiLimiter, requirePermission('chatbots_manage'), assertAiCreditAvailable('ai_generate_system_instruction'), aiController.generateSystemInstruction.bind(aiController));

// Edit existing landing page HTML (Tailwind CDN + preserve untouched sections) — cùng cơ chế luồng + requestId như route sinh trang.
router.post('/edit-landing-html', aiLimiter, requirePermission('landing_pages'), attachToExistingLandingTurn('edit'), assertAiCreditAvailable('ai_edit_landing_html'), aiController.editLandingHtml.bind(aiController));

// Create campaign from AI draft (NO auto-run)
router.post('/create-from-draft', aiLimiter, requirePermission('campaigns_create'), channelEntitlementContext, aiController.createCampaignFromDraft.bind(aiController));

// Read-only, deterministic campaign preview before the user creates a draft.
router.post('/prepare-campaign', aiLimiter, requirePermission('campaigns_view'), channelEntitlementContext, aiController.prepareCampaign.bind(aiController));

// Create AND RUN campaign automatically (no confirmation needed)
router.post('/create-and-run-campaign', aiLimiter, requireAllPermissions(['campaigns_create', 'campaigns_run']), channelEntitlementContext, aiController.createAndRunCampaign.bind(aiController));

// Business profile (RAG context)
router.get('/business-profile', requireSelfContext, aiController.getBusinessProfile.bind(aiController));
router.put('/business-profile', requireSelfContext, aiController.saveBusinessProfile.bind(aiController));

// Chat sessions (multi-session history)
router.get('/sessions', requirePermission('ai_assistant_use'), aiController.getSessions.bind(aiController));
router.get('/sessions/:id/messages', requirePermission('ai_assistant_use'), aiController.getSessionMessages.bind(aiController));
router.delete('/sessions/:id', requirePermission('ai_assistant_use'), aiController.deleteSession.bind(aiController));
// Wizard state mutation từ nút bấm (không gọi AI → không aiLimiter, không credit)
router.patch('/sessions/:id/wizard-state', requirePermission('ai_assistant_use'), aiController.patchWizardState.bind(aiController));
// Cập nhật data (landingPageId/slug/isPublished) của thẻ landing trong phiên, sau khi lưu qua
// /admin/landing-pages — không AI, không credit (PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md)
router.patch('/sessions/:id/landing-message', requirePermission('ai_assistant_use'), aiController.patchLandingMessage.bind(aiController));

// Dán HTML có sẵn vào phiên chat — không AI, không credit (cùng plan trên, Việc 1.1)
router.post('/landing-from-html', requirePermission('ai_assistant_use'), aiController.landingFromHtml.bind(aiController));

// Trích xuất danh sách người nhận từ tệp bảng tính
router.post('/extract-recipients', requirePermission('ai_assistant_use'), aiController.extractRecipients.bind(aiController));

// Custom AI Chatbot (for widget, Zalo OA, Facebook, Studio chat)
router.post('/custom-chat', requireSelfContext, aiLimiter, assertAiCreditAvailable('ai_custom_chat'), aiController.customChat.bind(aiController));

// Chat attachment for Studio (per-turn; NOT knowledge base)
router.post(
  '/chat-attachment',
  requirePermission('chatbots_manage'),
  uploadLimiter,
  workspaceUploadCapacityGuard,
  upload.single('file'),
  aiController.uploadChatAttachment.bind(aiController)
);
router.delete(
  '/chat-attachment',
  requirePermission('chatbots_manage'),
  aiLimiter,
  aiController.deleteChatAttachment.bind(aiController)
);

// Chatbot Studio Conversations
router.get('/chatbot-studio/conversations', requirePermission('chatbots_manage'), aiController.getChatbotStudioConversations.bind(aiController));
router.get('/chatbot-studio/conversations/:id', requirePermission('chatbots_manage'), aiController.getChatbotStudioConversation.bind(aiController));
router.get('/chatbot-studio/conversations/:id/messages', requirePermission('chatbots_manage'), aiController.getChatbotStudioMessages.bind(aiController));
router.post('/chatbot-studio/conversations', requirePermission('chatbots_manage'), aiController.createChatbotStudioConversation.bind(aiController));
router.post('/chatbot-studio/conversations/:id/messages', requirePermission('chatbots_manage'), aiController.addChatbotStudioMessage.bind(aiController));
router.delete('/chatbot-studio/conversations/:id', requirePermission('chatbots_manage'), aiController.deleteChatbotStudioConversation.bind(aiController));

// Custom AI - Document upload (extract, chunk, embed). Có `uploadLimiter` (D-11): ảnh/PDF quét đi qua OCR Gemini (tốn tiền)
// và cả tệp nằm trong RAM (multer memoryStorage, trần 100 MB); bản cũ không có limiter nào nên một tài khoản bắn liên tục được.
// Đặt TRƯỚC multer để lượt vượt trần bị từ chối khi chưa đọc thân tệp.
router.post('/custom-chat/upload', requirePermission('chatbots_manage'), uploadLimiter, upload.single('file'), aiController.customChatUpload.bind(aiController));

// Custom AI - Get documents
router.get('/custom-chat/documents/:chatbotId', requirePermission('chatbots_manage'), aiController.getCustomChatbotDocuments.bind(aiController));
router.get('/custom-chat/documents/:chatbotId/:docId', requirePermission('chatbots_manage'), aiController.getCustomChatbotDocument.bind(aiController));
router.delete('/custom-chat/documents/:chatbotId/:docId', requirePermission('chatbots_manage'), aiController.deleteCustomChatbotDocument.bind(aiController));
router.post('/custom-chat/text/:chatbotId', requirePermission('chatbots_manage'), aiController.addCustomChatTextDocument.bind(aiController));
// Cào URL (D-18): mở Chrome + embed cả trang — có `uploadLimiter` (cùng nhóm "nạp tài liệu" với tệp); bản cũ không limiter nào.
router.post('/custom-chat/scrape/:chatbotId', requirePermission('chatbots_manage'), uploadLimiter, aiController.scrapeCustomChatbotUrl.bind(aiController));

export default router;
