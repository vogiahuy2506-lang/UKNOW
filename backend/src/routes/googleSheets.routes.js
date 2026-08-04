import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireActivePlan, requirePasswordChange } from '../middleware/authorization.middleware.js';
import googleSheetsController from '../controllers/googleSheets.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requireActivePlan);

// Preview rows from a Google Sheet (public/anyone-with-link)
router.post('/preview', googleSheetsController.preview.bind(googleSheetsController));
// Check connection and return column names
router.post('/check', googleSheetsController.check.bind(googleSheetsController));


export default router;

