import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { uploadLimiter, supportTicketWriteLimiter } from '../middleware/rateLimiter.middleware.js';
import { receiveSupportAttachment } from '../middleware/supportAttachmentUpload.middleware.js';
import * as ctrl from '../controllers/supportTicket.controller.js';

const router = express.Router();

// Ticket góp ý / hỗ trợ: CHỈ authMiddleware.
//  - KHÔNG requireActivePlan: gói hết hạn vẫn phải gửi được yêu cầu hỗ trợ (vd "tôi không thanh toán được").
//  - KHÔNG requirePermission: nhân viên không có khoá quyền nào cho việc này; ticket gắn theo id NGƯỜI thao tác.
// Tên có tiền tố `support` — tránh trùng với vé SSE (services/sseTicket.service.js).
router.use(authMiddleware);

/** POST /api/support/tickets/attachments — multipart, field `file`, MỘT ảnh/lần (≤ 5 MB; png/jpeg/webp/gif) → { storageObjectId, key, name, size, mime, expiresAt } */
router.post('/attachments', uploadLimiter, receiveSupportAttachment, ctrl.uploadAttachment);
/** GET /api/support/tickets?page&limit&status → { items, counts, pagination } (ticket của CHÍNH mình) */
router.get('/', ctrl.list);
/** POST /api/support/tickets { subject, category, body, attachmentIds[] } → 201 { ticket, messages } */
router.post('/', supportTicketWriteLimiter, ctrl.create);
/** GET /api/support/tickets/:id → { ticket, messages } (của người khác → 404) */
router.get('/:id', ctrl.get);
/** POST /api/support/tickets/:id/messages { body, attachmentIds[] } → 201 { ticket, message } */
router.post('/:id/messages', supportTicketWriteLimiter, ctrl.addMessage);
/** POST /api/support/tickets/:id/close → { ticket } */
router.post('/:id/close', ctrl.close);
/** GET /api/support/tickets/:id/attachments/:objectId → ảnh (người tạo ticket hoặc super admin; người khác 404) */
router.get('/:id/attachments/:objectId', ctrl.streamAttachment);

export default router;
