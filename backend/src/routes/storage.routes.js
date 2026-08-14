import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { getUsage } from '../controllers/storage.controller.js';

const router = express.Router();

router.get('/usage', authMiddleware, getUsage);

export default router;
