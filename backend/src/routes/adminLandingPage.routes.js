import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireActivePlan } from '../middleware/authorization.middleware.js';
import landingPageAdminController from '../controllers/landingPageAdmin.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin', 'user'));
router.use(requireActivePlan);

router.get('/', landingPageAdminController.list.bind(landingPageAdminController));
router.get('/:id', landingPageAdminController.getById.bind(landingPageAdminController));
router.post('/', landingPageAdminController.create.bind(landingPageAdminController));
router.put('/:id', landingPageAdminController.update.bind(landingPageAdminController));
router.delete('/:id', landingPageAdminController.remove.bind(landingPageAdminController));

export default router;
