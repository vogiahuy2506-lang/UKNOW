import express from 'express';
import * as ctrl from '../controllers/publicPromotion.controller.js';

const router = express.Router();

router.get('/promotions/active', ctrl.active);

export default router;
