import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole, requireActivePlan, requirePermission } from '../middleware/authorization.middleware.js';
import landingPageAdminController from '../controllers/landingPageAdmin.controller.js';
import landingPageShareController from '../controllers/landingPageShare.controller.js';
import { requireSelfContext } from '../middleware/authorization.middleware.js';
import { body } from 'express-validator';
import handleValidationErrors from '../middleware/validate.middleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin', 'user'));
router.use(requireActivePlan);
router.use(requirePermission('landing_pages'));

router.get('/', landingPageAdminController.list.bind(landingPageAdminController));
router.get('/:id/custom-domain', landingPageAdminController.getCustomDomain.bind(landingPageAdminController));
router.put('/:id/custom-domain', landingPageAdminController.putCustomDomain.bind(landingPageAdminController));
router.post('/:id/custom-domain/verify', landingPageAdminController.postCustomDomainVerify.bind(landingPageAdminController));
router.post('/:id/custom-domain/provision-ssl', landingPageAdminController.postCustomDomainProvisionSsl.bind(landingPageAdminController));
router.get('/:id/versions', landingPageAdminController.listVersions.bind(landingPageAdminController));
router.get('/:id/versions/:versionId/preview', landingPageAdminController.previewVersion.bind(landingPageAdminController));
router.post('/:id/versions/:versionId/restore', landingPageAdminController.restoreVersion.bind(landingPageAdminController));
router.delete('/:id/versions/:versionId', landingPageAdminController.deleteVersion.bind(landingPageAdminController));
router.get('/:id/sheets-sync', landingPageAdminController.getSheetsSync.bind(landingPageAdminController));
router.put('/:id/sheets-sync', landingPageAdminController.putSheetsSync.bind(landingPageAdminController));

router.post('/assets', landingPageAdminController.uploadAsset.bind(landingPageAdminController));

// ============ Landing Page Sharing ============

// Get landing pages shared with me (must come before /:id)
router.get('/shared/with-me',
  requireSelfContext,
  landingPageShareController.getSharedWithMe.bind(landingPageShareController)
);

// Share a landing page with another user
router.post('/:id/share',
  requireSelfContext,
  [
    body('recipientEmail').isEmail().withMessage('Email không hợp lệ'),
    body('shareType').optional().isIn(['view', 'edit']).withMessage('Loại chia sẻ không hợp lệ')
  ],
  handleValidationErrors,
  landingPageShareController.share.bind(landingPageShareController)
);

// Get all shares for a landing page (owner only)
router.get('/:id/shares',
  requireSelfContext,
  landingPageShareController.getLandingPageShares.bind(landingPageShareController)
);

// Revoke a share
router.delete('/:id/share',
  requireSelfContext,
  landingPageShareController.revokeShare.bind(landingPageShareController)
);

router.get('/:id', landingPageAdminController.getById.bind(landingPageAdminController));
router.post('/', landingPageAdminController.create.bind(landingPageAdminController));
router.put('/:id', landingPageAdminController.update.bind(landingPageAdminController));
router.delete('/:id', landingPageAdminController.remove.bind(landingPageAdminController));

export default router;
