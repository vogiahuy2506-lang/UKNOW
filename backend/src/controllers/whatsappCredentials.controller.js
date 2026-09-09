/**
 * Controller for user-level WhatsApp Cloud API App credentials.
 *
 * Users register their OWN Meta App credentials (App ID + App Secret) so they
 * can connect WhatsApp without us having to share our App Secret with them.
 * The App Secret is encrypted with SMTP_SECRET_KEY (AES-256-GCM) before
 * persistence; it never leaves the server.
 *
 * Endpoints:
 *   GET    /api/whatsapp/credentials           — list current user's apps
 *   POST   /api/whatsapp/credentials           — register or update an app
 *   DELETE /api/whatsapp/credentials/:id       — remove an app
 *   PATCH  /api/whatsapp/credentials/:id       — set default / is_active
 */
import whatsappCredentialsService from '../services/chatbot/whatsappCredentials.service.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';

function sanitize(row) {
  if (!row) return null;
  // Never include any secret material in API responses.
  return {
    id: row.id,
    appId: row.appId,
    appName: row.appName,
    webhookVerifyToken: row.webhookVerifyToken,
    isDefault: row.isDefault,
    isActive: row.isActive,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class WhatsAppCredentialsController {
  async list(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const rows = await whatsappCredentialsService.listUserCredentials(userId);
      return res.json({ success: true, data: rows.map(sanitize) });
    } catch (err) {
      console.error('[WhatsAppCredentials] list error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  async upsert(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const { appId, appSecret, appName, webhookVerifyToken, makeDefault } = req.body || {};
      const row = await whatsappCredentialsService.upsertUserCredentials({
        userId,
        appId,
        appSecret,
        appName,
        webhookVerifyToken,
        makeDefault: !!makeDefault,
      });
      return res.json({ success: true, data: sanitize(row) });
    } catch (err) {
      console.error('[WhatsAppCredentials] upsert error:', err.message);
      const status = err.message?.includes('bắt buộc') ? 400 : 500;
      return res.status(status).json({ success: false, message: err.message });
    }
  }

  async remove(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id' });
      }
      const ok = await whatsappCredentialsService.deleteUserCredential(id, userId);
      if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
      return res.json({ success: true });
    } catch (err) {
      console.error('[WhatsAppCredentials] remove error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  async setDefault(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id' });
      }
      const row = await whatsappCredentialsService.setDefaultCredential(id, userId);
      if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
      return res.json({ success: true, data: sanitize(row) });
    } catch (err) {
      console.error('[WhatsAppCredentials] setDefault error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  async setActive(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = parseInt(req.params.id, 10);
      const { isActive } = req.body || {};
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id' });
      }
      const row = await whatsappCredentialsService.setActiveCredential(id, userId, !!isActive);
      if (!row) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
      return res.json({ success: true, data: sanitize(row) });
    } catch (err) {
      console.error('[WhatsAppCredentials] setActive error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }
}

export default new WhatsAppCredentialsController();
