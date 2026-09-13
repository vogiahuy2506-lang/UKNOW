import express from 'express';
import landingAssetController from '../controllers/landingAsset.controller.js';

const router = express.Router();

// GET /lp-assets/:key(*)
router.get('/:key(*)', (req, res) => landingAssetController.serveAsset(req, res));
router.get('/*', (req, res) => landingAssetController.serveAsset(req, res));

export default router;
