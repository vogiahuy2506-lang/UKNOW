import express from 'express';
import cors from 'cors';
import publicLeadController from '../controllers/publicLead.controller.js';
import landingFeaturedCoursePublicController from '../controllers/landingFeaturedCoursePublic.controller.js';
import landingTestimonialPublicController from '../controllers/landingTestimonialPublic.controller.js';
import landingPagePublicController from '../controllers/landingPagePublic.controller.js';
import { domainResolver } from '../middleware/domainResolver.js';

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

// GET /api/public/landing-pages/:slug - Get landing page by slug
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

// GET /api/public/lp - Get landing page for custom domain (resolves from Host header)
// This route is checked when req.isCustomDomain is set by domainResolver
router.get(
  '/lp',
  landingPagePublicController.getByDomain.bind(landingPagePublicController)
);

// GET /api/public/landing-featured-courses
router.get(
  '/landing-featured-courses',
  landingFeaturedCoursePublicController.list.bind(landingFeaturedCoursePublicController)
);

// GET /api/public/landing-testimonials
router.get(
  '/landing-testimonials',
  landingTestimonialPublicController.list.bind(landingTestimonialPublicController)
);

export default router;
