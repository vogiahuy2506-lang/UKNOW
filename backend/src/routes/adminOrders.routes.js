import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/admin/adminOrders.controller.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', ctrl.list);
router.patch('/:orderCode/cancel', ctrl.cancel);
router.patch('/:orderCode/paid-after-cancelled/handled', ctrl.markPaidAfterCancelledHandled);

export default router;
