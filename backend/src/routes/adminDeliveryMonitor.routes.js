import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/admin/adminDeliveryMonitor.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/overview', ctrl.overview);

export default router;
