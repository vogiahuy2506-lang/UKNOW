import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/authorization.middleware.js';
import landingTestimonialAdminController from '../controllers/landingTestimonialAdmin.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', landingTestimonialAdminController.list.bind(landingTestimonialAdminController));
router.post('/', landingTestimonialAdminController.create.bind(landingTestimonialAdminController));
router.put('/:id', landingTestimonialAdminController.update.bind(landingTestimonialAdminController));
router.delete('/:id', landingTestimonialAdminController.remove.bind(landingTestimonialAdminController));

export default router;
