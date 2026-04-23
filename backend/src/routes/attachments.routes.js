import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import downloadController from '../controllers/download.controller.js';

const router = express.Router();

// GET /api/attachments/presigned-by-key?key=<s3Key>&preview=true
// Trả về presigned S3 URL theo storage key (dành cho tệp đính kèm Zalo)
router.get(
  '/presigned-by-key',
  authMiddleware,
  downloadController.getPresignedDownloadByStorageKey.bind(downloadController)
);

// GET /api/attachments/:attachmentId/presigned-download
// Trả về presigned S3 URL để admin tải tệp (không cần tracking)
router.get(
  '/:attachmentId/presigned-download',
  authMiddleware,
  downloadController.getPresignedDownload.bind(downloadController)
);

export default router;
