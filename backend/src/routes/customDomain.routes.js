import { Router } from 'express';
import customDomainController from '../controllers/customDomain.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireActivePlan, requirePasswordChange, requirePhone } from '../middleware/authorization.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);

// GET /api/custom-domains - List user's domains
router.get('/', customDomainController.list.bind(customDomainController));

// POST /api/custom-domains - Create new domain
router.post('/', customDomainController.create.bind(customDomainController));

export default router;
