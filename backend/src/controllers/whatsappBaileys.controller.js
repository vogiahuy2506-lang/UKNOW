/**
 * Controller for the Baileys-backed WhatsApp flow (QR scan).
 *
 * This is the SIMPLE path: no Meta App, no App ID, no App Secret. The user
 * just opens this page, scans the QR with their WhatsApp Business phone,
 * done.
 *
 * Routes:
 *   POST  /api/whatsapp/sessions              start (or fetch existing) session
 *   GET   /api/whatsapp/sessions/:key         status + QR (if pending)
 *   GET   /api/whatsapp/sessions              list current user's sessions
 *   POST  /api/whatsapp/sessions/:key/disconnect
 *   DELETE /api/whatsapp/sessions/:key        log out + erase session files
 *   POST  /api/whatsapp/sessions/:key/messages  send a message (chatbot use)
 */
import { EventEmitter } from 'node:events';
import * as whatsappBaileysModule from '../services/chatbot/whatsappBaileys.service.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';

const whatsappBaileysService = whatsappBaileysModule;

function safeSessionKey(userId, sessionKey) {
  // Owner-scoped: only the owner can act on the session.
  return `${userId}-${sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

class WhatsAppBaileysController {
  async connect(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.body?.sessionKey || req.body?.chatbotId || 'default');
      const record = await whatsappBaileysService.connectSession(sessionKey);
      // Subscribe chatbot inbound handler (chatRouter + persist).
      try {
        const { registerSessionHandlers } = await import('../services/chatbot/whatsappBaileysInbox.service.js');
        registerSessionHandlers(sessionKey);
      } catch (subErr) {
        console.warn('[WhatsApp/Baileys] Could not subscribe inbox handler:', subErr.message);
      }
      return res.json({
        success: true,
        data: {
          sessionKey,
          status: record.status,
          qr: record.lastQr,
        },
      });
    } catch (err) {
      console.error('[WhatsApp/Baileys] connect error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async status(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.params.key);
      const rec = whatsappBaileysService.getSession(sessionKey);
      if (!rec) return res.json({ success: true, data: { sessionKey, status: 'closed', qr: null } });
      return res.json({ success: true, data: rec });
    } catch (err) {
      console.error('[WhatsApp/Baileys] status error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async list(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const all = whatsappBaileysService.listSessions();
      const persisted = whatsappBaileysService.listPersistedSessions();
      const myPrefix = `${userId}-`;
      const mine = all.filter((s) => s.sessionKey.startsWith(myPrefix));
      const myPersisted = persisted
        .filter((k) => k.startsWith(myPrefix))
        .map((k) => k.substring(myPrefix.length));
      const shortKeys = Array.from(new Set([
        ...mine.map((m) => m.sessionKey.substring(myPrefix.length)),
        ...myPersisted,
      ]));

      // Hydrate with detail (phone + name) so the UI can display nicely.
      const items = shortKeys.map((shortKey) => {
        const fullKey = `${userId}-${shortKey}`;
        const detail = whatsappBaileysService.getSession(fullKey) || {};
        return {
          sessionKey: fullKey,
          shortKey,
          status: detail.status || 'offline',
          phone: (detail.userId || '').split('@')[0] || null,
          name: detail.userName || null,
        };
      });

      return res.json({ success: true, data: items });
    } catch (err) {
      console.error('[WhatsApp/Baileys] list error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async disconnect(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.params.key);
      const ok = await whatsappBaileysService.disconnectSession(sessionKey);
      return res.json({ success: ok });
    } catch (err) {
      console.error('[WhatsApp/Baileys] disconnect error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async remove(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.params.key);
      const ok = whatsappBaileysService.deleteSessionFiles(sessionKey);
      return res.json({ success: ok });
    } catch (err) {
      console.error('[WhatsApp/Baileys] remove error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async updateSession(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.params.key);
      const { nickname } = req.body || {};
      // nickname cho phép empty string để xoá tên, max 255 chars
      const trimmed = typeof nickname === 'string' ? nickname.trim().slice(0, 255) : null;
      whatsappBaileysService.updateSessionNickname(sessionKey, trimmed);
      return res.json({ success: true });
    } catch (err) {
      console.error('[WhatsApp/Baileys] updateSession error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async sendMessage(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.params.key);
      const { to, text } = req.body || {};
      if (!to || !text) {
        return res.status(400).json({ success: false, message: 'to và text là bắt buộc' });
      }
      const result = await whatsappBaileysService.sendMessage(sessionKey, to, text);
      return res.json({ success: true, data: { messageId: result?.key?.id } });
    } catch (err) {
      console.error('[WhatsApp/Baileys] sendMessage error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  /**
   * DEBUG-only: inject a fake inbound 'message' event into the session's
   * emitter to verify end-to-end pipeline (persist → AI → reply) without
   * waiting for live WhatsApp stream.
   *
   * POST /api/ai/whatsapp-baileys/sessions/:key/_inject
   * Body: { text: string, externalPhone?: string, fromMe?: false }
   */
  async injectTestMessage(req, res) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not available in production' });
    }
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.params.key);
      const sessions = whatsappBaileysService.listSessions();
      const target = sessions.find((s) => s.sessionKey === sessionKey);
      if (!target?.emitter) {
        return res.status(404).json({ success: false, message: 'Session không tồn tại hoặc chưa attached emitter' });
      }
      const listenerCount = target.emitter.listenerCount('message');
      const { text = 'TEST', externalPhone = '84999999999' } = req.body || {};
      const fakeMsg = {
        key: {
          remoteJid: `${externalPhone}@s.whatsapp.net`,
          fromMe: false,
          id: 'TEST_INJECT_' + Date.now(),
        },
        message: { conversation: String(text).slice(0, 1000) },
        pushName: 'Test User',
      };
      console.log(`[WhatsApp/Baileys] [DEBUG] inject fake message into ${sessionKey} (listeners=${listenerCount})`);
      target.emitter.emit('message', { sessionKey, message: fakeMsg });
      return res.json({ success: true, data: { listeners: listenerCount } });
    } catch (err) {
      console.error('[WhatsApp/Baileys] inject error:', err.message);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}

// Stub EventEmitter import (avoid unused-var warning).
// eslint-disable-next-line no-unused-vars
const _emitterEvents = EventEmitter;

export default new WhatsAppBaileysController();
