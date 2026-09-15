import express from 'express';
import formController from '../controllers/form.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
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
router.get('/:id', formController.get.bind(formController));
router.put('/:id', formController.update.bind(formController));
router.delete('/:id', formController.delete.bind(formController));
router.put('/:id/publish', formController.publish.bind(formController));
router.get('/:id/submissions', formController.submissions.bind(formController));
router.post('/:id/submissions/:submissionId/cancel', formController.cancelSubmission.bind(formController));
router.post('/:id/submissions/:submissionId/confirm-payment', formController.confirmPayment.bind(formController));
router.get('/:id/campaign-preview', formController.campaignPreview.bind(formController));

export default router;
