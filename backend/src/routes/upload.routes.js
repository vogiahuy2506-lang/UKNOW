import express from 'express';
import multer from 'multer';
import uploadController from '../controllers/upload.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/authorization.middleware.js';
import { uploadLimiter } from '../middleware/rateLimiter.middleware.js';
import { HELP_IMAGE_MAX_BYTES } from '../utils/helpImageUpload.util.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});
const helpImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HELP_IMAGE_MAX_BYTES },
});

// auth trước → uploadLimiter key theo user (không theo IP)
router.post('/temp', authMiddleware, uploadLimiter, upload.single('file'), uploadController.uploadTemp.bind(uploadController));
router.post('/logo', authMiddleware, uploadLimiter, upload.single('file'), uploadController.uploadLogo.bind(uploadController));
router.post('/promote', authMiddleware, uploadLimiter, uploadController.promoteTemp.bind(uploadController));
router.post(
  '/help-image',
  authMiddleware,
  requireAdmin,
  uploadLimiter,
  helpImageUpload.single('file'),
  uploadController.uploadHelpImage.bind(uploadController)
);
router.delete('/temp/:tempId', authMiddleware, uploadController.deleteTempFile.bind(uploadController));
router.get('/signed-url/:key(*)', authMiddleware, uploadController.getSignedUrl.bind(uploadController));

// Catch-all route for wrong endpoints
router.post('/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint không tồn tại. Sử dụng /api/uploads/temp để upload file tạm thời'
  });
});

export default router;
