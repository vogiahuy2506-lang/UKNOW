import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/userDeliveryMonitor.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/overview', ctrl.overview);

export default router;
