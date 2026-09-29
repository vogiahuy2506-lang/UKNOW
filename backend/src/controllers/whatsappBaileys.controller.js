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
import db from '../config/database.js';
import { enforceResourceLimitTx } from '../utils/userResourceLimit.util.js';
import * as whatsappBaileysModule from '../services/chatbot/whatsappBaileys.service.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';
import { logWorkspace, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../services/audit.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

const whatsappBaileysService = whatsappBaileysModule;

/**
 * Ghi nhật ký hoạt động cho vòng đời tài khoản WhatsApp. `audit_logs.entity_id` là BIGINT nên KHÔNG nhét
 * sessionKey (chuỗi "<userId>-<key>") vào entityId — để ở details. Không ghi SĐT (chỉ sessionKey/shortKey).
 * Lỗi ghi nhật ký không được làm hỏng thao tác chính.
 */
async function auditAccount(req, action, sessionKey, extra = {}) {
  try {
    await logWorkspace(getWorkspaceAuditContext(req), action, AUDIT_ENTITY_TYPES.WHATSAPP_ACCOUNT, null, {
      channel: 'whatsapp_baileys',
      sessionKey,
      ...extra,
    });
  } catch (err) {
    console.warn('[WhatsApp/Baileys] audit error:', err.message);
  }
}

function safeSessionKey(userId, sessionKey) {
  // Owner-scoped: only the owner can act on the session.
  return `${userId}-${sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/**
 * W5 — hạn mức số tài khoản WhatsApp theo gói. Chỉ phiên MỚI (chưa có dòng creds, chưa có trong bộ nhớ) mới bị
 * đếm: kết nối lại phiên đã có không tốn thêm chỗ. Advisory lock giữ suốt `connectSession` để hai lần kết nối
 * song song của cùng chủ không cùng qua cổng; dòng creds do Baileys ghi ngay sau khi tạo socket nên cửa sổ hở còn lại rất hẹp.
 */
async function connectWithAccountLimit(authUser, userId, sessionKey) {
  const inMemory = whatsappBaileysService.getSession(sessionKey);
  const persisted = inMemory ? [] : await whatsappBaileysService.listPersistedSessions();
  if (inMemory || persisted.includes(sessionKey)) {
    return whatsappBaileysService.connectSession(sessionKey);
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await enforceResourceLimitTx(client, {
      userId,
      roleCode: authUser?.role,
      resourceKey: 'whatsappAccounts',
    });
    const record = await whatsappBaileysService.connectSession(sessionKey);
    await client.query('COMMIT');
    return record;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

class WhatsAppBaileysController {
  async connect(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const sessionKey = safeSessionKey(userId, req.body?.sessionKey || req.body?.chatbotId || 'default');
      // Inbox handler auto-subscribe bên trong `connectSession()` (single
      // source of truth — áp dụng cho cả boot-time restorePersistedSessions
      // lẫn user-initiated connect). Không cần gọi `registerSessionHandlers`
      // ở đây nữa; gọi thêm vẫn idempotent nhờ flag
      // `__baileysInboxRegistered` nhưng sẽ tạo log duplicate.
      const record = await connectWithAccountLimit(req.user, userId, sessionKey);
      // P6 — tạo dòng `whatsapp_account_settings` (có id để khoá sau hạ gói) NGAY khi phiên mở, để id lớn = thêm sau.
      try {
        const { ensureWhatsappSettingsRow } = await import('../repositories/payment/topupLock.repository.js');
        await ensureWhatsappSettingsRow(userId, sessionKey);
      } catch (settingsErr) {
        console.warn('[WhatsApp/Baileys] ensure settings row failed:', settingsErr.message);
      }
      await auditAccount(req, AUDIT_ACTIONS.WHATSAPP_ACCOUNT_CONNECT_STARTED, sessionKey, { status: record.status });
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
      if (err.code === 'RESOURCE_LIMIT_EXCEEDED') {
        return res.status(400).json({
          success: false,
          message: err.message,
          code: err.code,
          resource: err.resource,
          limitReached: true,
        });
      }
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
      // `listPersistedSessions` is async (Postgres-backed
      // session_key scan); without `await` here we get a
      // Promise and `persisted.filter` throws on the next line.
      // See `restoreAllSessions()` below for the same fix.
      const persisted = await whatsappBaileysService.listPersistedSessions();
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
      if (ok) await auditAccount(req, AUDIT_ACTIONS.WHATSAPP_ACCOUNT_DISCONNECTED, sessionKey);
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
      // deleteSessionFiles là async — thiếu await thì `ok` là Promise (JSON ra `{}`) và xoá chưa xong đã trả lời.
      const ok = await whatsappBaileysService.deleteSessionFiles(sessionKey);
      if (ok) await auditAccount(req, AUDIT_ACTIONS.WHATSAPP_ACCOUNT_DELETED, sessionKey);
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
      await auditAccount(req, AUDIT_ACTIONS.WHATSAPP_ACCOUNT_RENAMED, sessionKey, { nickname: trimmed });
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
