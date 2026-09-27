import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import landingCustomizerController from '../controllers/landingCustomizer.controller.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/', landingCustomizerController.list.bind(landingCustomizerController));
router.get('/:page', landingCustomizerController.getByPage.bind(landingCustomizerController));
router.post('/', landingCustomizerController.create.bind(landingCustomizerController));
router.put('/:id', landingCustomizerController.update.bind(landingCustomizerController));
router.delete('/:id', landingCustomizerController.delete.bind(landingCustomizerController));
router.post('/bulk', landingCustomizerController.bulkUpsert.bind(landingCustomizerController));

router.get('/:page/html-mode', landingCustomizerController.getHtmlMode.bind(landingCustomizerController));
router.put('/:page/html-mode', landingCustomizerController.saveHtmlMode.bind(landingCustomizerController));

export default router;
