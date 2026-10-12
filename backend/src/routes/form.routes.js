import express from 'express';
import formController from '../controllers/form.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { aiLimiter } from '../middleware/rateLimiter.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import {
  requirePermission,
  requireActivePlan,
  requirePasswordChange,
  requirePhone,
} from '../middleware/authorization.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);
router.use(requirePermission('forms'));

router.get('/', formController.list.bind(formController));
router.post('/', formController.create.bind(formController));
router.post('/assets', formController.uploadAsset.bind(formController));
// PHẢI đứng TRƯỚC '/:id' — không thì 'submissions' bị hiểu là :id (parseInt → NaN → 400).
router.get('/submissions', formController.listWorkspaceSubmissions.bind(formController));
// AI soạn biểu mẫu (PR-5): trả NHÁP, không ghi CSDL. Cùng chuỗi kiểm AI như "AI viết hộ" chatbot: giới hạn tần suất 20/phút → cổng credit
// (hết lượt / gói hết hạn / nhân viên vượt hạn mức → 402/403 trước khi gọi Google) → controller trừ 1 credit SAU khi nháp thành công.
// Quyền `forms` đã áp cho cả router ở trên. Đặt trước '/:id' như '/submissions'.
router.post('/ai-draft', aiLimiter, assertAiCreditAvailable('form_draft'), formController.aiDraft.bind(formController));
// PR-4b — cờ tính năng cho trình soạn. Cũng PHẢI trước '/:id'.
router.get('/capabilities', formController.capabilities.bind(formController));
router.get('/:id', formController.get.bind(formController));
router.put('/:id', formController.update.bind(formController));
router.delete('/:id', formController.delete.bind(formController));
router.put('/:id/publish', formController.publish.bind(formController));
router.get('/:id/submissions', formController.submissions.bind(formController));
router.get('/:id/submissions/:submissionId/receipt', formController.getSubmissionReceipt.bind(formController));
router.get(
  '/:id/submissions/:submissionId/files/:fieldKey/:index/link',
  formController.getSubmissionFileLink.bind(formController)
);
router.post('/:id/submissions/:submissionId/cancel', formController.cancelSubmission.bind(formController));
router.post('/:id/submissions/:submissionId/confirm-payment', formController.confirmPayment.bind(formController));
router.get('/:id/campaign-preview', formController.campaignPreview.bind(formController));

export default router;
