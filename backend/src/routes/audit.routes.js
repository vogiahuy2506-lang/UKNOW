import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireSelfContext } from '../middleware/authorization.middleware.js';
import { getWorkspaceLogs } from '../controllers/audit.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('user'));
router.use(requireSelfContext);

// GET /api/audit-logs — employer xem nhật ký workspace
router.get('/', getWorkspaceLogs);

export default router;
