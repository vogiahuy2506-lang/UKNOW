/**
 * telegramPersonal.service.js
 *
 * Orchestrates everything the Node.js backend needs to manage Telegram
 * personal accounts: starts QR login flows, polls the gateway, persists
 * accounts into PostgreSQL, and sends messages through the gateway.
 *
 * The service never opens an MTProto socket itself — that's the Python
 * gateway's job. We just remember which Telegram user_id belongs to
 * which UKNOW user + account row.
 */
import chatbotTelegramRepository from '../../repositories/chatbot/chatbotTelegram.repository.js';
import telegramGateway from './telegramGateway.client.js';
import { hasPermanentAuthKey } from '../../utils/telegramSession.util.js';
import db from '../../config/database.js';
import { enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';

const LOGIN_CONTEXT_TTL_SECONDS = 15 * 60;

class TelegramPersonalService {
  constructor() {
    // sessionId → { userId, roleCode, expiresAt }
    this._loginContexts = new Map();
    this._sweepInterval = setInterval(() => this._sweepContexts(), 60 * 1000);
    // Allow Node to exit cleanly during tests.
    if (typeof this._sweepInterval.unref === 'function') {
      this._sweepInterval.unref();
    }
  }

  _sweepContexts() {
    const now = Date.now();
    for (const [key, ctx] of this._loginContexts.entries()) {
      if (ctx.expiresAt <= now) {
        this._loginContexts.delete(key);
      }
    }
  }

  /**
   * Begin a new QR login flow for `userId`.
   * Returns the session_id + QR payload that the SPA renders.
   */
  async startLogin(userId, roleCode = undefined) {
    const { data } = await telegramGateway.createSession(userId);
    const sessionId = data.session_id;
    if (!sessionId) {
      throw new Error('Telegram gateway did not return a session_id');
    }
    this._loginContexts.set(sessionId, {
      userId,
      roleCode,
      expiresAt: Date.now() + LOGIN_CONTEXT_TTL_SECONDS * 1000,
    });
    return {
      sessionId,
      qrUrl: data.qr_url,
      qrImageBase64: data.qr_image_base64,
      expiresAt: data.expires_at,
    };
  }

  /**
   * Poll the gateway for the status of a QR login flow. When Telegram
   * reports success we create the local account row and tell the gateway
   * to bind the session to it (so it knows which `account_id` to use).
   */
  async checkLoginStatus(sessionId) {
    const ctx = this._loginContexts.get(sessionId);
    if (!ctx) {
      return { status: 'not_found' };
    }
    const { data } = await telegramGateway.getStatus(sessionId);
    if (data.status !== 'success') {
      return { status: data.status, error: data.error };
    }

    const user = data.user || {};
    if (!user.telegram_user_id) {
      return { status: 'error', error: 'Telegram gateway did not return a user' };
    }

    const accountInput = {
      idUser: ctx.userId,
      telegramUserId: Number(user.telegram_user_id),
      phone: user.phone || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      username: user.username || null,
    };
    // W5 — hạn mức số tài khoản Telegram theo gói: chỉ tài khoản MỚI (chưa có (id_user, telegram_user_id))
    // bị đếm; đăng nhập lại tài khoản cũ chỉ cập nhật dòng, không tốn thêm chỗ. Enforce + INSERT cùng giao dịch.
    const alreadyLinked = await chatbotTelegramRepository.getAccountByTelegramUserId(
      accountInput.telegramUserId,
      { userId: ctx.userId }
    );
    let account;
    if (alreadyLinked) {
      account = await chatbotTelegramRepository.createAccount(accountInput);
    } else {
      const client = await db.getClient();
      try {
        await client.query('BEGIN');
        await enforceResourceLimitTx(client, {
          userId: ctx.userId,
          roleCode: ctx.roleCode,
          resourceKey: 'telegramAccounts',
        });
        account = await chatbotTelegramRepository.createAccount(accountInput, client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (error?.code === 'RESOURCE_LIMIT_EXCEEDED') {
          // Vượt hạn mức: không giữ phiên QR đã đăng nhập mà không có dòng tài khoản nào trỏ tới.
          this._loginContexts.delete(sessionId);
          await telegramGateway.cancelSession(sessionId).catch(() => {});
        }
        throw error;
      } finally {
        client.release();
      }
    }

    // Tell the gateway to remember which `account_id` this Telegram
    // session is bound to. Future `listAccounts` calls include `is_loaded`.
    try {
      await telegramGateway.bindAccount(Number(user.telegram_user_id), account.id);
      await telegramGateway.ensureHandler(Number(user.telegram_user_id));
    } catch (err) {
      // Not fatal — bind/ensureHandler are convenience calls. The login
      // itself succeeded; admins can manually re-bind later if needed.
      console.warn('[TelegramPersonal] post-login gateway call failed:', err.message);
    }

    // One-shot context: clean up so the same session_id can't be polled
    // again to leak the binding to a different user.
    this._loginContexts.delete(sessionId);

    return {
      status: 'success',
      account,
    };
  }

  async cancelLogin(sessionId) {
    this._loginContexts.delete(sessionId);
    try {
      await telegramGateway.cancelSession(sessionId);
    } catch (err) {
      // 404 means the gateway already cleaned it up — fine.
      if (err.status !== 404) {
        console.warn('[TelegramPersonal] cancelSession failed:', err.message);
      }
    }
    return { cancelled: true };
  }

  // ── Channel Settings management ────────────────────────────────────

  async listAccounts(userId) {
    const [local, gateway] = await Promise.all([
      chatbotTelegramRepository.listAccountsByUser(userId),
      telegramGateway.isConfigured()
        ? telegramGateway.listAccounts().catch((err) => {
            console.warn('[TelegramPersonal] gateway listAccounts failed:', err.message);
            return { data: [] };
          })
        : Promise.resolve({ data: [] }),
    ]);

    const loadedSet = new Set(
      (gateway.data || [])
        .filter((row) => row.is_loaded)
        .map((row) => String(row.telegram_user_id))
    );

    // session_ok: phiên còn khoá đăng nhập không. Chỉ đọc CSDL (KHÔNG dựng client/kết nối — getClient
    // có thể xoá phiên). Client đang nằm trong RAM => chắc chắn còn phiên. Không trả blob ra API.
    return Promise.all(
      local.map(async (row) => {
        const isLoaded = loadedSet.has(String(row.telegram_user_id));
        let sessionOk = false;
        if (isLoaded) {
          sessionOk = true;
        } else if (row.is_active) {
          try {
            const blob = await chatbotTelegramRepository.getSessionString(row.telegram_user_id);
            sessionOk = hasPermanentAuthKey(blob);
          } catch {
            sessionOk = false;
          }
        }
        return { ...row, is_loaded: isLoaded, session_ok: sessionOk };
      })
    );
  }

  async deleteAccount(userId, id) {
    const account = await chatbotTelegramRepository.getAccountById(id, { userId });
    if (!account) return null;
    const deleted = await chatbotTelegramRepository.deleteAccount(userId, id);
    if (deleted) {
      try {
        await telegramGateway.deleteAccount(account.telegram_user_id);
      } catch (err) {
        console.warn('[TelegramPersonal] gateway delete failed:', err.message);
      }
    }
    return deleted;
  }

  async logoutAccount(userId, id) {
    const account = await chatbotTelegramRepository.getAccountById(id, { userId });
    if (!account) return null;
    try {
      await telegramGateway.deleteAccount(account.telegram_user_id);
    } catch (err) {
      console.warn('[TelegramPersonal] gateway logout failed:', err.message);
    }
    return chatbotTelegramRepository.deactivateAccount(userId, id);
  }

  // ── DeployTab toggle ───────────────────────────────────────────────

  async listAccountsWithChatbotSettings(userId, chatbotId) {
    return chatbotTelegramRepository.listAccountsForUser(userId, chatbotId);
  }

  async toggleAccountChatbot(userId, accountId, chatbotId, enabled) {
    const settings = await chatbotTelegramRepository.setEnabled(
      userId,
      accountId,
      chatbotId,
      enabled
    );
    // Re-warm the gateway so it picks up the new enable flag for any
    // incoming message that arrives immediately after the toggle.
    const account = await chatbotTelegramRepository.getAccountById(accountId, { userId });
    if (account) {
      telegramGateway
        .ensureHandler(account.telegram_user_id)
        .catch((err) => console.warn('[TelegramPersonal] ensureHandler failed:', err.message));
    }
    return settings;
  }
}

const telegramPersonalService = new TelegramPersonalService();
export default telegramPersonalService;
