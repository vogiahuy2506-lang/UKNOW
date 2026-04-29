import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import { overview } from '../controllers/admin/adminStats.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('super_admin'));

router.get('/overview', overview);

export default router;
