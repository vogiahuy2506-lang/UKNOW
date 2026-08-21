import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requirePermission } from '../middleware/authorization.middleware.js';
import {
  listMediaLibrary,
  listChannelMedia,
  listStorageObjects,
  deleteStorageObject,
} from '../controllers/mediaLibrary.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('user'));

router.get('/', requirePermission('media_library_view'), listMediaLibrary);
router.get('/channels', requirePermission('media_library_view'), listChannelMedia);
router.get('/objects', requirePermission('media_library_view'), listStorageObjects);
router.delete('/objects/:id', requirePermission('media_library_manage'), deleteStorageObject);

export default router;
