/**
 * Routes for the QR-scan WhatsApp flow (Baileys).
 *
 * Mount prefix: /api/whatsapp-qr
 *
 * Difference from /api/whatsapp/* (which uses Meta Cloud API):
 *   - No Meta App / App ID / App Secret / Business verification required.
 *   - User scans a QR with their WhatsApp Business phone and done.
 *   - Suitable for individual users; high-volume senders should use the
 *     Cloud API path (Meta-grade).
 */
import express from 'express';
import authMiddleware from '../middleware/auth.middleware.js';
import {
  requirePasswordChange,
  requirePhone,
} from '../middleware/authorization.middleware.js';
import whatsappBaileysController from '../controllers/whatsappBaileys.controller.js';

const router = express.Router();

// NOTE: deliberately do NOT require requireActivePlan here — QR-connect should
// be available to brand-new users who have not yet picked a plan.
router.use(authMiddleware);
router.use(requirePasswordChange);
router.use(requirePhone);

// Open (or fetch existing) a session. Returns the current QR data-URL (if any).
router.post('/sessions', whatsappBaileysController.connect.bind(whatsappBaileysController));

// Poll the session for QR / status updates (every 1–2s). Cheap; backed by in-memory map.
router.get('/sessions/:key', whatsappBaileysController.status.bind(whatsappBaileysController));

// List the current user's WhatsApp numbers (live + persisted).
router.get('/sessions', whatsappBaileysController.list.bind(whatsappBaileysController));

// Disconnect (keeps creds so a future reconnect reuses them).
router.post('/sessions/:key/disconnect', whatsappBaileysController.disconnect.bind(whatsappBaileysController));

// Remove — disconnect AND erase creds (forces a fresh QR next time).
router.delete('/sessions/:key', whatsappBaileysController.remove.bind(whatsappBaileysController));

// Update session metadata (e.g. display nickname).
router.patch('/sessions/:key', whatsappBaileysController.updateSession.bind(whatsappBaileysController));

// Send a test message — used by the onboarding UI to verify the connection.
router.post('/sessions/:key/messages', whatsappBaileysController.sendMessage.bind(whatsappBaileysController));
router.post('/sessions/:key/_inject', whatsappBaileysController.injectTestMessage.bind(whatsappBaileysController));

export default router;
