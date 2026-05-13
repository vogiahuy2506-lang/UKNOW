import { Router } from 'express';
import landingTemplateController from '../controllers/landingTemplate.controller.js';

const router = Router();

// GET /api/landing-templates - List all templates (optional: ?category=xxx)
router.get('/', landingTemplateController.list.bind(landingTemplateController));

// GET /api/landing-templates/categories - Get categories with count
router.get('/categories', landingTemplateController.getCategories.bind(landingTemplateController));

// GET /api/landing-templates/:id - Get single template
router.get('/:id', landingTemplateController.getById.bind(landingTemplateController));

// GET /api/landing-templates/:id/html - Get template HTML structure only
router.get('/:id/html', landingTemplateController.getHtml.bind(landingTemplateController));

// POST /api/landing-templates/generate - Generate landing page from prompt
router.post('/generate', landingTemplateController.generate.bind(landingTemplateController));

export default router;
