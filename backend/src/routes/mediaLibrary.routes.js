import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import { listMediaLibrary, listChannelMedia } from '../controllers/mediaLibrary.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('user'));

router.get('/', listMediaLibrary);
router.get('/channels', listChannelMedia);

export default router;
