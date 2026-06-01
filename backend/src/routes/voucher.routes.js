import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/voucher.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.get('/available', ctrl.available);
router.get('/code-suggestions', ctrl.codeSuggestions);
router.post('/validate', ctrl.validate);

export default router;
