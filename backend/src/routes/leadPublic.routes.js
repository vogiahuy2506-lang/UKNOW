import express from 'express';
import publicLeadController from '../controllers/publicLead.controller.js';
import { publicLeadLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.post('/', publicLeadLimiter, (req, res) => publicLeadController.create(req, res));

export default router;
