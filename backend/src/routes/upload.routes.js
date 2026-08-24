import express from 'express';
import multer from 'multer';
import uploadController from '../controllers/upload.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin, requireAnyPermission, requirePermission } from '../middleware/authorization.middleware.js';
import { uploadLimiter } from '../middleware/rateLimiter.middleware.js';
import { HELP_IMAGE_MAX_BYTES } from '../utils/helpImageUpload.util.js';
import { MAX_UPLOAD_FILE_BYTES } from '../utils/uploadLimits.util.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { getStoragePaths, STORAGE_POOL_TYPES } from '../utils/storageCapacity.util.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_FILE_BYTES },
});
const helpImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HELP_IMAGE_MAX_BYTES },
});
const storagePaths = getStoragePaths();
const workspaceTempCapacityGuard = storageCapacityGuard({
  paths: [storagePaths.tempUploads],
});
const workspacePromoteCapacityGuard = storageCapacityGuard({
  paths: [storagePaths.uploads],
});
const systemHelpCapacityGuard = storageCapacityGuard({
  paths: [storagePaths.tempUploads, storagePaths.uploads],
  poolType: STORAGE_POOL_TYPES.SYSTEM,
});
const TEMP_UPLOAD_PERMISSIONS = [
  'media_library_manage',
  'email_templates',
  'zalo_templates',
  'landing_pages',
  'courses',
  'chatbots_manage',
  'inbox_reply',
  'campaigns_create',
];

// auth trước → uploadLimiter key theo user (không theo IP)
router.post('/temp', authMiddleware, requireAnyPermission(TEMP_UPLOAD_PERMISSIONS), uploadLimiter, workspaceTempCapacityGuard, upload.single('file'), uploadController.uploadTemp.bind(uploadController));
router.post('/logo', authMiddleware, requireAnyPermission(['media_library_manage', 'courses']), uploadLimiter, upload.single('file'), uploadController.uploadLogo.bind(uploadController));
router.post('/image', authMiddleware, requireAnyPermission(TEMP_UPLOAD_PERMISSIONS), uploadLimiter, upload.single('file'), uploadController.uploadImage.bind(uploadController));
router.post('/promote', authMiddleware, requirePermission('media_library_manage'), uploadLimiter, workspacePromoteCapacityGuard, uploadController.promoteTemp.bind(uploadController));
router.post(
  '/help-image',
  authMiddleware,
  requireAdmin,
  uploadLimiter,
  systemHelpCapacityGuard,
  helpImageUpload.single('file'),
  uploadController.uploadHelpImage.bind(uploadController)
);
router.delete('/temp/:tempId', authMiddleware, requireAnyPermission(TEMP_UPLOAD_PERMISSIONS), uploadController.deleteTempFile.bind(uploadController));
router.get('/signed-url/:key(*)', authMiddleware, requirePermission('media_library_view'), uploadController.getSignedUrl.bind(uploadController));

// Catch-all route for wrong endpoints
router.post('/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint không tồn tại. Sử dụng /api/uploads/temp để upload file tạm thời'
  });
});

export default router;
