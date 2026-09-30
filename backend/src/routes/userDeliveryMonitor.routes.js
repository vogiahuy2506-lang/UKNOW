import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/authorization.middleware.js';
import * as ctrl from '../controllers/userDeliveryMonitor.controller.js';

const router = express.Router();

router.use(authMiddleware);
// Cùng khoá với route và menu phía FE (App.jsx `delivery-monitor`, navConfig `delivery_monitor`): đây là trang vận
// hành chiến dịch. Trước đây BE đòi `reports_view` còn FE đòi `campaigns_view` nên nhân viên chỉ có `campaigns_view`
// thấy menu nhưng mọi API trả 403 (audit C-06).
router.use(requirePermission('campaigns_view'));

router.get('/overview', ctrl.overview);
router.get('/runs/:runId/failures', ctrl.runFailures);

export default router;
