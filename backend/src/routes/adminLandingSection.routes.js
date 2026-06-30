import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import landingPageSectionController from '../controllers/landingPageSection.controller.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authMiddleware);
router.use(requireRole('admin'));

// CRUD routes
router.get('/', landingPageSectionController.list.bind(landingPageSectionController));
router.get('/page/:page', landingPageSectionController.getByPage.bind(landingPageSectionController));
router.get('/:page/:section', landingPageSectionController.getByPageAndSection.bind(landingPageSectionController));
router.post('/', landingPageSectionController.create.bind(landingPageSectionController));
router.put('/:id', landingPageSectionController.update.bind(landingPageSectionController));
router.put('/:page/:section', landingPageSectionController.upsertByPageAndSection.bind(landingPageSectionController));
router.delete('/:id', landingPageSectionController.delete.bind(landingPageSectionController));
router.delete('/:page/:section', landingPageSectionController.deleteByPageAndSection.bind(landingPageSectionController));

export default router;
