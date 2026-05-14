import express from 'express';
import cors from 'cors';
import publicLeadController from '../controllers/publicLead.controller.js';
import landingFeaturedCoursePublicController from '../controllers/landingFeaturedCoursePublic.controller.js';
import landingTestimonialPublicController from '../controllers/landingTestimonialPublic.controller.js';
import landingPagePublicController from '../controllers/landingPagePublic.controller.js';

const router = express.Router();

/** Cho phép gọi API public từ custom domain (Origin = www.khách.com) — GET/POST landing + analytics. */
const landingPublicCors = cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,
});

router.post('/leads', publicLeadController.create.bind(publicLeadController));

router.get(
  '/landing-track/go',
  landingPagePublicController.getTrackGo.bind(landingPagePublicController)
);

router.post(
  '/landing-analytics/view',
  landingPublicCors,
  landingPagePublicController.postView.bind(landingPagePublicController)
);

router.get(
  '/landing-pages-by-host',
  landingPublicCors,
  landingPagePublicController.getPublishedByHost.bind(landingPagePublicController)
);

router.get(
  '/landing-pages/:slug',
  landingPublicCors,
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
