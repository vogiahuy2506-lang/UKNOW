import express from 'express';
import publicLeadController from '../controllers/publicLead.controller.js';
import landingFeaturedCoursePublicController from '../controllers/landingFeaturedCoursePublic.controller.js';
import landingTestimonialPublicController from '../controllers/landingTestimonialPublic.controller.js';
import landingPagePublicController from '../controllers/landingPagePublic.controller.js';

const router = express.Router();

router.post('/leads', publicLeadController.create.bind(publicLeadController));

router.get(
  '/landing-track/go',
  landingPagePublicController.getTrackGo.bind(landingPagePublicController)
);

router.post(
  '/landing-analytics/view',
  landingPagePublicController.postView.bind(landingPagePublicController)
);

router.get(
  '/landing-pages/:slug',
  landingPagePublicController.getPublished.bind(landingPagePublicController)
);

router.get(
  '/landing-featured-courses',
  landingFeaturedCoursePublicController.list.bind(landingFeaturedCoursePublicController)
);

router.get(
  '/landing-testimonials',
  landingTestimonialPublicController.list.bind(landingTestimonialPublicController)
);

export default router;
