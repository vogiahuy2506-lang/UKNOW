import express from 'express';
import downloadController from '../controllers/download.controller.js';

const router = express.Router();

// Endpoint công khai — không cần auth
// Tracking tải tệp đính kèm từ email: ghi sự kiện attachment_downloaded, redirect tới S3
router.get('/attachment/:token', downloadController.trackAttachmentDownload.bind(downloadController));

export default router;
