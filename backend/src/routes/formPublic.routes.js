import express from 'express';
import formPublicController from '../controllers/formPublic.controller.js';
import { publicFormSubmissionLimiter, formUnsubscribeLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// PR-7b — PHẢI khai TRƯỚC `/:publicKey` bên dưới: express khớp route theo thứ tự khai, nếu để
// sau thì "unsubscribe" sẽ bị nuốt làm giá trị của tham số `:publicKey`.
router.get('/unsubscribe/:token', formUnsubscribeLimiter, formPublicController.unsubscribe.bind(formPublicController));

router.get('/:publicKey', formPublicController.getPublic.bind(formPublicController));
router.get('/:publicKey/slots', formPublicController.getSlots.bind(formPublicController));
router.get('/:publicKey/submissions/:accessToken', formPublicController.getSubmissionStatus.bind(formPublicController));
router.post(
  '/:publicKey/submissions',
  publicFormSubmissionLimiter,
  formPublicController.submitPublic.bind(formPublicController)
);

export default router;
