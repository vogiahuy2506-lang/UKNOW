import express from 'express';
import formPublicController from '../controllers/formPublic.controller.js';
import { publicFormSubmissionLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get('/:publicKey', formPublicController.getPublic.bind(formPublicController));
router.get('/:publicKey/slots', formPublicController.getSlots.bind(formPublicController));
router.post(
  '/:publicKey/submissions',
  publicFormSubmissionLimiter,
  formPublicController.submitPublic.bind(formPublicController)
);

export default router;
