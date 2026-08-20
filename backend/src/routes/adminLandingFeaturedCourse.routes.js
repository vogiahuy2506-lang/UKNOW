import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireActivePlan, requireSelfContext } from '../middleware/authorization.middleware.js';
import landingFeaturedCourseAdminController from '../controllers/landingFeaturedCourseAdmin.controller.js';
import { storageCapacityGuard } from '../middleware/storageCapacity.middleware.js';
import { getStoragePaths } from '../utils/storageCapacity.util.js';

const router = express.Router();
const hasTempImage = (req) => Boolean(req.body?.imageTempId && req.body?.imageOriginalName);
const workspacePromotionCapacityGuard = storageCapacityGuard({
  paths: [getStoragePaths().uploads],
  shouldCheck: hasTempImage,
});

router.use(authMiddleware);
router.use(requireRole('admin', 'user'));
router.use(requireActivePlan);
router.use(requireSelfContext);

router.get('/', landingFeaturedCourseAdminController.list.bind(landingFeaturedCourseAdminController));
router.post('/', workspacePromotionCapacityGuard, landingFeaturedCourseAdminController.create.bind(landingFeaturedCourseAdminController));
router.put('/:id', workspacePromotionCapacityGuard, landingFeaturedCourseAdminController.update.bind(landingFeaturedCourseAdminController));
router.delete('/:id', landingFeaturedCourseAdminController.remove.bind(landingFeaturedCourseAdminController));

export default router;
