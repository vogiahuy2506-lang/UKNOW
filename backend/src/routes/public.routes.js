import express from 'express';
import publicLeadController from '../controllers/publicLead.controller.js';
import landingFeaturedCoursePublicController from '../controllers/landingFeaturedCoursePublic.controller.js';
import landingTestimonialPublicController from '../controllers/landingTestimonialPublic.controller.js';

const router = express.Router();

router.post('/leads', publicLeadController.create.bind(publicLeadController));

router.get(
  '/landing-featured-courses',
  landingFeaturedCoursePublicController.list.bind(landingFeaturedCoursePublicController)
);

router.get(
  '/landing-testimonials',
  landingTestimonialPublicController.list.bind(landingTestimonialPublicController)
);

export default router;
