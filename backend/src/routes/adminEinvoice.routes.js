import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/admin/adminEinvoice.controller.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', ctrl.list);
router.post('/:id/retry', ctrl.retry);
router.post('/:id/resend-email', ctrl.resendEmail);

export default router;
