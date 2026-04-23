import express from 'express';
import multer from 'multer';
import uploadController from '../controllers/upload.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/temp', authMiddleware, upload.single('file'), uploadController.uploadTemp.bind(uploadController));
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
