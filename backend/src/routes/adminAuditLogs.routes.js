import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import { getSystemLogs } from '../controllers/audit.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

// GET /api/admin/audit-logs — super admin xem nhật ký hệ thống
router.get('/', getSystemLogs);

export default router;
