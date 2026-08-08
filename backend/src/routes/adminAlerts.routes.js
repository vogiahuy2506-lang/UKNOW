import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import {
  overview,
  updateRule,
  resolveEvent,
  runEvaluate,
  cronStatus,
} from '../controllers/admin/adminAlerts.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/overview', overview);
router.patch('/rules/:id', updateRule);
router.post('/events/:id/resolve', resolveEvent);
router.post('/evaluate', runEvaluate);
router.get('/cron-status', cronStatus);

export default router;
