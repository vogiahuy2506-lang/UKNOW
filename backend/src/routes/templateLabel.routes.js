import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import templateLabelController from '../controllers/templateLabel.controller.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/', templateLabelController.list.bind(templateLabelController));
router.post('/', templateLabelController.create.bind(templateLabelController));
router.delete('/:id', templateLabelController.remove.bind(templateLabelController));

export default router;
