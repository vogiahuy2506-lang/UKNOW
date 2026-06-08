import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import landingTemplateController from '../controllers/landingTemplate.controller.js';

const router = Router();

// GET /api/landing-templates - List all public templates (optional: ?category=xxx)
router.get('/', landingTemplateController.list.bind(landingTemplateController));

// GET /api/landing-templates/categories - Get categories with count
router.get('/categories', landingTemplateController.getCategories.bind(landingTemplateController));

// GET /api/landing-templates/my - Get current user's templates (requires auth)
router.get('/my', authMiddleware, landingTemplateController.getMyTemplates.bind(landingTemplateController));

// GET /api/landing-templates/:id - Get single template
router.get('/:id', landingTemplateController.getById.bind(landingTemplateController));

// GET /api/landing-templates/:id/html - Get template HTML structure only
router.get('/:id/html', landingTemplateController.getHtml.bind(landingTemplateController));

// POST /api/landing-templates - Create new template (requires auth)
router.post('/', authMiddleware, landingTemplateController.create.bind(landingTemplateController));

// DELETE /api/landing-templates/:id - Delete template (requires auth)
router.delete('/:id', authMiddleware, landingTemplateController.delete.bind(landingTemplateController));

// POST /api/landing-templates/generate - Generate landing page from prompt (requires auth to save session)
router.post('/generate', authMiddleware, landingTemplateController.generate.bind(landingTemplateController));

export default router;
