import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import { uploadLimiter, supportTicketWriteLimiter } from '../middleware/rateLimiter.middleware.js';
import { receiveSupportAttachment } from '../middleware/supportAttachmentUpload.middleware.js';
import * as ctrl from '../controllers/admin/adminSupportTicket.controller.js';
import * as userCtrl from '../controllers/supportTicket.controller.js';

const router = express.Router();

// Super admin (users.role = 'admin') mới thấy ticket của mọi người và liên hệ từ trang chủ.
router.use(authMiddleware);
router.use(requireRole('admin'));

/** GET /api/admin/support/tickets?page&limit&status&category&search → { items, counts, pagination } */
router.get('/tickets', ctrl.listTickets);
/** GET /api/admin/support/tickets/:id → { ticket (kèm user), messages } */
router.get('/tickets/:id', ctrl.getTicket);
/** POST /api/admin/support/tickets/:id/reply { body, attachmentIds[] } → 201 { ticket, message } (ticket sang awaiting_user) */
router.post('/tickets/:id/reply', supportTicketWriteLimiter, ctrl.reply);
/** POST /api/admin/support/tickets/:id/status { status } → { ticket } */
router.post('/tickets/:id/status', ctrl.setStatus);
/** POST /api/admin/support/attachments — như route người dùng (admin đính ảnh vào câu trả lời) */
router.post('/attachments', uploadLimiter, receiveSupportAttachment, userCtrl.uploadAttachment);
/** GET /api/admin/support/tickets/:id/attachments/:objectId → ảnh */
router.get('/tickets/:id/attachments/:objectId', userCtrl.streamAttachment);

/** GET /api/admin/support/contact-submissions?page&limit&status&search → { items, counts, pagination } */
router.get('/contact-submissions', ctrl.listContactSubmissions);
/** PATCH /api/admin/support/contact-submissions/:id { status?, notes? } → liên hệ sau cập nhật */
router.patch('/contact-submissions/:id', ctrl.patchContactSubmission);

export default router;
