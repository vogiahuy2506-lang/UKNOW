import { Router } from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { assertAiCreditAvailable } from '../middleware/aiCredit.middleware.js';
import landingTemplateController from '../controllers/landingTemplate.controller.js';
import { requirePermission, requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';

const router = Router();

// Public routes — không cần auth
router.get('/', landingTemplateController.list.bind(landingTemplateController));
router.get('/categories', landingTemplateController.getCategories.bind(landingTemplateController));

// Authenticated routes
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// GET /api/landing-templates/my - Get current user's templates
router.get('/my', requirePermission('landing_pages'), landingTemplateController.getMyTemplates.bind(landingTemplateController));

// GET /api/landing-templates/:id - Get single template
router.get('/:id', requirePermission('landing_pages'), landingTemplateController.getById.bind(landingTemplateController));

// GET /api/landing-templates/:id/html - Get template HTML structure only
router.get('/:id/html', requirePermission('landing_pages'), landingTemplateController.getHtml.bind(landingTemplateController));

// POST /api/landing-templates - Create new template
router.post('/', requirePermission('landing_pages'), landingTemplateController.create.bind(landingTemplateController));

// PUT /api/landing-templates/:id - Update template
router.put('/:id', requirePermission('landing_pages'), landingTemplateController.update.bind(landingTemplateController));

// DELETE /api/landing-templates/:id - Delete template
router.delete('/:id', requirePermission('landing_pages'), landingTemplateController.delete.bind(landingTemplateController));

// POST /api/landing-templates/generate - Generate landing page from prompt
router.post('/generate', requirePermission('landing_pages'), assertAiCreditAvailable('landing_template_generate'), landingTemplateController.generate.bind(landingTemplateController));

export default router;
