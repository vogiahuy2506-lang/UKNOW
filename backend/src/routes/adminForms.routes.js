import express from 'express';
import adminFormsController from '../controllers/admin/adminForms.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', adminFormsController.list.bind(adminFormsController));
router.put('/:id/disable', adminFormsController.disable.bind(adminFormsController));
router.put('/:id/enable', adminFormsController.enable.bind(adminFormsController));

export default router;
