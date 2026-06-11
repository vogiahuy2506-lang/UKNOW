import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/admin/bulkNotification.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/recipient-count', ctrl.getRecipientCount);
router.post('/send', ctrl.sendNotification);

export default router;
