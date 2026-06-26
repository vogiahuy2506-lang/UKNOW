import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import landingTemplateController from '../controllers/landingTemplate.controller.js';

const router = Router();

// GET /api/landing-templates - List all public templates (optional: ?category=xxx)
router.get('/', landingTemplateController.list.bind(landingTemplateController));

// GET /api/landing-templates/categories - Get categories with count
router.get('/categories', landingTemplateController.getCategories.bind(landingTemplateController));

// GET /api/landing-templates/my - Get current user's templates (requires auth)
router.get('/my', authMiddleware, landingTemplateController.getMyTemplates.bind(landingTemplateController));

// GET /api/landing-templates/:id - Get single template (requires auth)
router.get('/:id', authMiddleware, landingTemplateController.getById.bind(landingTemplateController));

// GET /api/landing-templates/:id/html - Get template HTML structure only (requires auth)
router.get('/:id/html', authMiddleware, landingTemplateController.getHtml.bind(landingTemplateController));

// POST /api/landing-templates - Create new template (requires auth)
router.post('/', authMiddleware, landingTemplateController.create.bind(landingTemplateController));

// PUT /api/landing-templates/:id - Update template (requires auth)
router.put('/:id', authMiddleware, landingTemplateController.update.bind(landingTemplateController));

// DELETE /api/landing-templates/:id - Delete template (requires auth)
router.delete('/:id', authMiddleware, landingTemplateController.delete.bind(landingTemplateController));

// POST /api/landing-templates/generate - Generate landing page from prompt (requires auth to save session)
router.post('/generate', authMiddleware, assertAiCreditAvailable('landing_template_generate'), landingTemplateController.generate.bind(landingTemplateController));

export default router;
