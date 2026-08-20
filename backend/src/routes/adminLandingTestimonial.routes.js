import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireActivePlan, requireSelfContext } from '../middleware/authorization.middleware.js';
import landingTestimonialAdminController from '../controllers/landingTestimonialAdmin.controller.js';
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

router.get('/', landingTestimonialAdminController.list.bind(landingTestimonialAdminController));
router.post('/', workspacePromotionCapacityGuard, landingTestimonialAdminController.create.bind(landingTestimonialAdminController));
router.put('/:id', workspacePromotionCapacityGuard, landingTestimonialAdminController.update.bind(landingTestimonialAdminController));
router.delete('/:id', landingTestimonialAdminController.remove.bind(landingTestimonialAdminController));

export default router;
