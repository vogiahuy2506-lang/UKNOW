import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authMiddleware from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/authorization.middleware.js';
import landingCustomizerController from '../controllers/landingCustomizer.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Get source code of landing page components
const SOURCE_FILES = {
  hero: path.resolve(__dirname, '../../../frontend/src/pages/public/HeroPage.jsx'),
  contact: path.resolve(__dirname, '../../../frontend/src/pages/public/ContactPage.jsx'),
  pricing: path.resolve(__dirname, '../../../frontend/src/pages/public/PricingPage.jsx'),
};

router.get('/source/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const filePath = SOURCE_FILES[page];
    
    if (!filePath) {
      return res.status(404).json({ success: false, message: 'Page not found' });
    }
    
    if (fs.existsSync(filePath)) {
      const source = fs.readFileSync(filePath, 'utf-8');
      return res.json({ success: true, source });
    } else {
      return res.status(404).json({ success: false, message: 'Source file not found' });
    }
  } catch (error) {
    console.error('[LandingCustomizerController.getSource]', error);
    return res.status(500).json({ success: false, message: 'Error reading source' });
  }
});

// Element positions routes
router.get('/:page/positions', landingCustomizerController.getPositions.bind(landingCustomizerController));
router.put('/:page/positions', landingCustomizerController.savePositions.bind(landingCustomizerController));
router.delete('/:page/positions/:elementKey', landingCustomizerController.deletePosition.bind(landingCustomizerController));

export default router;
