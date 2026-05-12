import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireActivePlan } from '../middleware/authorization.middleware.js';
import landingFeaturedCourseAdminController from '../controllers/landingFeaturedCourseAdmin.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin', 'user'));
router.use(requireActivePlan);

router.get('/', landingFeaturedCourseAdminController.list.bind(landingFeaturedCourseAdminController));
router.post('/', landingFeaturedCourseAdminController.create.bind(landingFeaturedCourseAdminController));
router.put('/:id', landingFeaturedCourseAdminController.update.bind(landingFeaturedCourseAdminController));
router.delete('/:id', landingFeaturedCourseAdminController.remove.bind(landingFeaturedCourseAdminController));

export default router;
