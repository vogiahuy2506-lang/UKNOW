import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireActivePlan, requirePasswordChange, requirePhone, requireAnyPermission } from '../middleware/authorization.middleware.js';
import templateLabelController from '../controllers/templateLabel.controller.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);
router.use(requireAnyPermission(['email_templates', 'zalo_templates']));

router.get('/', templateLabelController.list.bind(templateLabelController));
router.post('/', templateLabelController.create.bind(templateLabelController));
router.delete('/:id', templateLabelController.remove.bind(templateLabelController));

export default router;
