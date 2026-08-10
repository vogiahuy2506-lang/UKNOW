import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/authorization.middleware.js';
import * as helpController from '../controllers/help.controller.js';

const router = Router();

// Public docs API
router.get('/articles', helpController.listPublic);
router.get('/articles/:slug', helpController.getPublicBySlug);
router.get('/feature/:featureKey', helpController.resolveFeature);

// Admin
router.get('/admin/articles', authMiddleware, requireAdmin, helpController.adminList);
router.get('/admin/articles/:id', authMiddleware, requireAdmin, helpController.adminGet);
router.post('/admin/articles', authMiddleware, requireAdmin, helpController.adminCreate);
router.patch('/admin/articles/:id', authMiddleware, requireAdmin, helpController.adminUpdate);
router.delete('/admin/articles/:id', authMiddleware, requireAdmin, helpController.adminRemove);
router.post('/admin/articles/:id/reindex', authMiddleware, requireAdmin, helpController.adminReindex);
router.post('/admin/articles/:id/translate', authMiddleware, requireAdmin, helpController.adminTranslate);
router.get('/admin/unanswered', authMiddleware, requireAdmin, helpController.adminUnanswered);
router.post('/admin/seed', authMiddleware, requireAdmin, helpController.adminSeed);

export default router;
