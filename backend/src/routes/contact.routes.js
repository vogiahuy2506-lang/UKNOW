import { Router } from 'express';
import { submitContact } from '../controllers/contact.controller.js';
import { publicLeadLimiter } from '../middleware/rateLimiter.middleware.js';

const router = Router();

// POST /api/contact — public, không yêu cầu auth
router.post('/', publicLeadLimiter, submitContact);

export default router;
