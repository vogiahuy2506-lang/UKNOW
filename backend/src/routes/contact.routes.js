import { Router } from 'express';
import { submitContact } from '../controllers/contact.controller.js';

const router = Router();

// POST /api/contact — public, không yêu cầu auth
router.post('/', submitContact);

export default router;
