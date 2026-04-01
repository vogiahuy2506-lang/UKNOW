import express from 'express';
import publicLeadController from '../controllers/publicLead.controller.js';

const router = express.Router();

router.post('/leads', publicLeadController.create.bind(publicLeadController));

export default router;
