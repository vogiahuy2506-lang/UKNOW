import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requirePermission } from '../middleware/authorization.middleware.js';
import {
  listStorageObjects,
  deleteStorageObject,
} from '../controllers/mediaLibrary.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('user'));

// Không còn `GET /channels` (tab "Tệp khách gửi", gỡ 04/10/2026): nó đọc cột `attachments` của tin Zalo mà luồng nhận tin
// không bao giờ ghi, nên trả rỗng với mọi tài khoản. Tệp Telegram/WhatsApp khách gửi vẫn nằm ở `/objects` (nhóm "chat").
router.get('/objects', requirePermission('media_library_view'), listStorageObjects);
router.delete('/objects/:id', requirePermission('media_library_manage'), deleteStorageObject);

export default router;
