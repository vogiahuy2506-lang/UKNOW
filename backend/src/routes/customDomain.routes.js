import { Router } from 'express';
import customDomainController from '../controllers/customDomain.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/custom-domains - List user's domains
router.get('/', customDomainController.list.bind(customDomainController));

// GET /api/custom-domains/:id - Get domain details
router.get('/:id', customDomainController.getById.bind(customDomainController));

// POST /api/custom-domains - Create new domain
router.post('/', customDomainController.create.bind(customDomainController));

// PUT /api/custom-domains/:id - Update domain
router.put('/:id', customDomainController.update.bind(customDomainController));

// DELETE /api/custom-domains/:id - Delete domain
router.delete('/:id', customDomainController.delete.bind(customDomainController));

// POST /api/custom-domains/:id/verify - Verify domain
router.post('/:id/verify', customDomainController.verify.bind(customDomainController));

// GET /api/custom-domains/:id/verification-instructions - Get DNS instructions
router.get('/:id/verification-instructions', customDomainController.getVerificationInstructions.bind(customDomainController));

// GET /api/custom-domains/:id/ssl-status - Get SSL status
router.get('/:id/ssl-status', customDomainController.getSslStatus.bind(customDomainController));

export default router;
