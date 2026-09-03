import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireActivePlan, requirePasswordChange, requirePhone, requirePermission } from '../middleware/authorization.middleware.js';
import googleSheetsController from '../controllers/googleSheets.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);
router.use(requireActivePlan);

// Preview rows from a Google Sheet (public/anyone-with-link)
router.post('/preview', requirePermission('integrations_manage'), googleSheetsController.preview.bind(googleSheetsController));
// Check connection and return column names
router.post('/check', requirePermission('integrations_manage'), googleSheetsController.check.bind(googleSheetsController));


export default router;
