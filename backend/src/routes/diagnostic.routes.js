import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import ctrl from '../controllers/diagnostic.controller.js';

const router = express.Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/channels', ctrl.getSupportedChannels.bind(ctrl));
router.post('/runs', ctrl.createRun.bind(ctrl));
router.get('/runs', ctrl.listRuns.bind(ctrl));
router.get('/runs/:id', ctrl.getRun.bind(ctrl));

export default router;
