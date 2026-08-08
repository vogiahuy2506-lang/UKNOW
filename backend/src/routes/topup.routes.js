import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireSelfContext } from '../middleware/authorization.middleware.js';
import {
  getConfig,
  quote,
  createPayment,
  getLocks,
  putLocks,
} from '../controllers/topup.controller.js';

const router = Router();

router.get('/config', authMiddleware, requireSelfContext, getConfig);
router.post('/quote', authMiddleware, requireSelfContext, quote);
router.post('/create-payment', authMiddleware, requireSelfContext, createPayment);
router.get('/locks', authMiddleware, requireSelfContext, getLocks);
router.put('/locks', authMiddleware, requireSelfContext, putLocks);

export default router;
