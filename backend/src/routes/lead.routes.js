import express from 'express';
import leadController from '../controllers/lead.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/preview', leadController.preview.bind(leadController));

export default router;
