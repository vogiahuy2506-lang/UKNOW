import express from 'express';
import leadController from '../controllers/lead.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission, requireActivePlan, requirePasswordChange, requirePhone } from '../middleware/authorization.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);

router.get('/preview', requirePermission('leads'), leadController.preview.bind(leadController));
router.get(
  '/custom-field-definitions',
  requirePermission('leads'),
  leadController.listCustomFieldDefinitions.bind(leadController)
);

/**
 * GET /api/leads/export — tải Excel theo bộ lọc (đặt trước `/` để không bị nhầm path).
 */
router.get('/export', requirePermission('leads'), leadController.exportXlsx.bind(leadController));

/**
 * GET /api/leads — danh sách lead landing (phân trang + lọc). Đặt sau /preview để không đụng path.
 */
router.get('/', requirePermission('leads'), leadController.list.bind(leadController));

export default router;
