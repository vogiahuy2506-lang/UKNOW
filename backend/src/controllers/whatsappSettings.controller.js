import crypto from 'crypto';
import chatbotChannelRepository from '../repositories/ai/chatbotChannel.repository.js';
import chatbotWhatsAppAccountRepository from '../repositories/chatbot/chatbotWhatsAppAccount.repository.js';
import chatbotRepository from '../repositories/ai/chatbot.repository.js';
import whatsappOAuthService, {
  consumePendingOAuth,
  peekPendingOAuth,
  stashPendingOAuth,
  verifyState,
} from '../services/chatbot/whatsappOAuth.service.js';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  logWorkspace,
} from '../services/audit.service.js';
import { resolveWorkspaceOwnerId } from '../services/storage/storageQuota.service.js';
import { getWorkspaceAuditContext } from '../utils/auditContext.util.js';

class WhatsAppSettingsController {
  /**
   * GET /api/whatsapp/accounts
   * List every WhatsApp account connection owned by the current user.
   */
  async getAccounts(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const rows = await chatbotWhatsAppAccountRepository.listAccountsForUser(userId);
      const sanitized = rows.map((row) => this._sanitizeAccount(row));
      return res.json({ success: true, data: { items: sanitized } });
    } catch (err) {
      console.error('[WhatsAppSettings] getAccounts error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/whatsapp/accounts/oauth/init
   * Body: { appId? }
   * Build the Meta OAuth URL. If the user has registered their own Meta App
   * credentials (via /api/whatsapp/credentials endpoints), we use those.
   * Otherwise we fall back to the env-level credentials (only when
   * ALLOW_ENV_FALLBACK_WHATSAPP=true — typically only the platform owner).
   *
   * Returns 400 with a friendly hint if neither path is configured, so the
   * SPA can prompt the user to add their App ID + App Secret.
   */
  async initOAuth(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const requestedAppId = req.body?.appId || req.query?.appId || null;
      const { auth_url, state } = await whatsappOAuthService.buildAuthorizationUrl({
        userId,
        appId: requestedAppId,
      });
      stashPendingOAuth(state, { userId, kind: 'whatsapp' });
      return res.json({ success: true, data: { auth_url, state } });
    } catch (err) {
      console.error('[WhatsAppSettings] initOAuth error:', err.message);
      const status = err.status || 400;
      return res.status(status).json({
        success: false,
        message: err.message,
        code: 'NEEDS_WHATSAPP_CREDENTIALS',
      });
    }
  }

  /**
   * GET /api/whatsapp/accounts/oauth/pending?state=...
   * After Meta redirects back to the SPA, the SPA calls this to fetch the
   * list of phone numbers the user picked during Embedded Signup.
   */
  async getPendingOAuth(req, res) {
    try {
      const state = String(req.query?.state || '');
      const entry = peekPendingOAuth(state);
      if (!entry) {
        return res.status(404).json({ success: false, message: 'OAuth state not found or expired' });
      }
      return res.json({ success: true, data: entry });
    } catch (err) {
      console.error('[WhatsAppSettings] getPendingOAuth error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  /**
   * POST /api/whatsapp/accounts/oauth/complete
   * Body: { chatbotId, state, phone_number_id, phone_number, waba_id,
   *         business_id?, display_name?, is_default? }
   *
   * Persists a single WhatsApp account connection. To attach multiple
   * numbers, call this endpoint multiple times with different
   * `phone_number_id` values.
   */
  async completeOAuth(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const {
        chatbotId,
        state,
        phone_number_id,
        phone_number,
        waba_id,
        business_id,
        display_name,
        is_default,
      } = req.body || {};

      const chatbotIdNum = parseInt(chatbotId, 10);
      if (!chatbotIdNum || Number.isNaN(chatbotIdNum)) {
        return res.status(400).json({ success: false, message: 'chatbotId là bắt buộc' });
      }
      if (!state) {
        return res.status(400).json({ success: false, message: 'state là bắt buộc' });
      }
      if (!phone_number_id || !waba_id) {
        return res.status(400).json({ success: false, message: 'phone_number_id và waba_id là bắt buộc' });
      }

      const pending = consumePendingOAuth(state);
      if (!pending || pending.userId !== userId) {
        return res.status(400).json({ success: false, message: 'OAuth state không hợp lệ hoặc đã hết hạn' });
      }

      const chatbot = await chatbotRepository.findChatbotById(chatbotIdNum, userId);
      if (!chatbot) {
        return res.status(404).json({ success: false, message: 'Chatbot không tồn tại' });
      }

      // For Embedded Signup the access token is delivered out-of-band by Meta
      // via the popup (it stays on the user's browser). Until that lands we
      // fall back to the OAuth code exchange flow — this endpoint accepts a
      // fresh code so we can exchange it server-side.
      let accessToken = pending.accessToken || null;
      let resolvedAppId = pending.appId || null;
      let resolvedAppSecret = null;
      if (pending.code && !accessToken) {
        try {
          const exchange = await whatsappOAuthService.exchangeCodeForToken({
            code: pending.code,
            redirectUri: whatsappOAuthService.getConfig().redirectUri,
            userId,
            appId: pending.appId,
          });
          accessToken = exchange.accessToken;
        } catch (exchangeErr) {
          console.warn('[WhatsAppSettings] code exchange failed:', exchangeErr.message);
        }
      }
      if (!accessToken) {
        return res.status(400).json({
          success: false,
          message: 'Không nhận được access_token từ Meta. Vui lòng thử kết nối lại.',
        });
      }

      // Pull the user's app secret for storage. We only need it to keep the
      // webhook signed correctly — Meta does not re-call it for normal
      // messages, so a missing row degrades gracefully.
      try {
        const whatsappCredentialsService = (await import('../services/chatbot/whatsappCredentials.service.js')).default;
        const creds = await whatsappCredentialsService.resolveCredentials({
          userId,
          appId: pending.appId,
        });
        resolvedAppId = resolvedAppId || creds?.appId || null;
        resolvedAppSecret = creds?.appSecret || null;
      } catch (credErr) {
        console.warn('[WhatsAppSettings] resolveCredentials in completeOAuth failed:', credErr.message);
      }

      // Generate per-channel webhook token + verify token.
      const webhookToken = crypto.randomBytes(32).toString('hex');
      const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
        || crypto.randomBytes(16).toString('hex');
      const backendBase = process.env.BACKEND_PUBLIC_URL || '';
      const webhookUrl = `${backendBase}/api/webhooks/chatbot/whatsapp/${webhookToken}`;

      const channel = await chatbotChannelRepository.upsertWhatsAppAccount(chatbotIdNum, {
        credentials: {
          access_token: accessToken,
          app_secret: resolvedAppSecret
            || process.env.WHATSAPP_APP_SECRET
            || process.env.META_APP_SECRET
            || null,
          verify_token: verifyToken,
        },
        webhook_token: webhookToken,
        webhook_url: webhookUrl,
        display_name: display_name || phone_number || `WhatsApp ${phone_number_id}`,
        external_channel_id: phone_number_id,
        phone_number: phone_number || null,
        phone_number_id,
        waba_id,
        business_id: business_id || null,
        app_id: resolvedAppId || null,
        settings: {},
        is_active: false, // user opts-in via ChannelSettings toggle
      });

      if (is_default) {
        await chatbotChannelRepository.setWhatsAppDefault(userId, channel.id);
      }

      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CHATBOT_CHANNEL_CONNECTED, AUDIT_ENTITY_TYPES.CHATBOT_CHANNEL, channel.id, {
        channelType: 'whatsapp',
        chatbotId: chatbotIdNum,
        wabaId: waba_id,
        phoneNumberId: phone_number_id,
      });

      return res.json({
        success: true,
        data: {
          id: channel.id,
          chatbotId: chatbotIdNum,
          phoneNumberId: channel.phone_number_id,
          phoneNumber: channel.phone_number,
          wabaId: channel.waba_id,
          displayName: channel.display_name,
          webhookUrl: channel.webhook_url,
          verifyToken,
          isActive: channel.is_active,
        },
        message: 'Tài khoản WhatsApp đã được kết nối. Bật AI trong danh sách để bắt đầu nhận tin nhắn.',
      });
    } catch (err) {
      console.error('[WhatsAppSettings] completeOAuth error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  /**
   * DELETE /api/whatsapp/accounts/:id
   * Soft-deactivate a WhatsApp connection. Cascades per-chatbot settings
   * via the ON DELETE CASCADE FK.
   */
  async deleteAccount(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid account id' });
      }

      const row = await chatbotChannelRepository.findActiveChannelById(id);
      if (!row || row.channel_type !== 'whatsapp' || String(row.id_user) !== String(userId)) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }

      const deactivated = await chatbotChannelRepository.deactivateWhatsAppById(id);
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CHATBOT_CHANNEL_DISCONNECTED, AUDIT_ENTITY_TYPES.CHATBOT_CHANNEL, id, {
        channelType: 'whatsapp',
        chatbotId: row.id_chatbot,
      });

      return res.json({ success: true, data: this._sanitizeAccount(deactivated) });
    } catch (err) {
      console.error('[WhatsAppSettings] deleteAccount error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  /**
   * PATCH /api/whatsapp/accounts/:id/default
   * Marks a WhatsApp connection as the user's default. Cleared on the
   * previously-default row in the same transaction.
   */
  async setDefault(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid account id' });
      }

      const row = await chatbotChannelRepository.findActiveChannelById(id);
      if (!row || row.channel_type !== 'whatsapp' || String(row.id_user) !== String(userId)) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }

      await chatbotChannelRepository.setWhatsAppDefault(userId, id);
      const updated = await chatbotChannelRepository.findActiveChannelById(id);
      return res.json({ success: true, data: this._sanitizeAccount(updated) });
    } catch (err) {
      console.error('[WhatsAppSettings] setDefault error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  /**
   * PATCH /api/whatsapp/accounts/:id/active
   * Body: { enabled: boolean }
   * Toggles the GLOBAL is_active flag on the channel row. This is the
   * ChannelSettings-level "Bật AI cho tài khoản này" switch. Per-chatbot
   * toggles live in /api/ai/chatbot/whatsapp-account/.../toggle.
   */
  async toggleActive(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const id = parseInt(req.params.id, 10);
      const { enabled } = req.body || {};
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid account id' });
      }
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'enabled phải là boolean' });
      }

      const row = await chatbotChannelRepository.findActiveChannelById(id);
      if (!row || row.channel_type !== 'whatsapp' || String(row.id_user) !== String(userId)) {
        return res.status(404).json({ success: false, message: 'Account not found' });
      }

      const updated = await chatbotChannelRepository.updateWhatsAppActive(id, enabled);
      await logWorkspace(getWorkspaceAuditContext(req), AUDIT_ACTIONS.CHATBOT_CHANNEL_UPDATED, AUDIT_ENTITY_TYPES.CHATBOT_CHANNEL, id, {
        channelType: 'whatsapp',
        enabled,
      });

      return res.json({ success: true, data: this._sanitizeAccount(updated) });
    } catch (err) {
      console.error('[WhatsAppSettings] toggleActive error:', err.message);
      return res.status(err.status || 500).json({ success: false, message: err.message });
    }
  }

  _sanitizeAccount(row) {
    if (!row) return null;
    return {
      id: row.id,
      chatbotId: row.id_chatbot,
      chatbotName: row.chatbot_name || null,
      displayName: row.display_name,
      phoneNumber: row.phone_number,
      phoneNumberId: row.phone_number_id,
      wabaId: row.waba_id,
      businessId: row.business_id,
      appId: row.app_id,
      isActive: row.is_active,
      isDefault: row.is_default === true,
      chatbotEnabled: row.chatbot_enabled === true,
      connectedAt: row.connected_at,
      lastActivityAt: row.last_activity_at,
    };
  }
}

export default new WhatsAppSettingsController();
export { stashPendingOAuth, consumePendingOAuth, verifyState };
