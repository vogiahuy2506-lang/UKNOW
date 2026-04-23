import express from 'express';
import trackingShortLinkController from '../controllers/trackingShortLink.controller.js';

const router = express.Router();

// Public redirect endpoint: /t/:code
router.get('/:code', trackingShortLinkController.redirectByCode.bind(trackingShortLinkController));

export default router;

