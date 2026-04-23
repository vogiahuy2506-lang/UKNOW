import express from 'express';
import downloadController from '../controllers/download.controller.js';

const router = express.Router();

// Endpoints công khai — không cần auth
router.get('/:token/download', downloadController.handleDownload.bind(downloadController));
router.get('/:token',          downloadController.handleView.bind(downloadController));

export default router;
