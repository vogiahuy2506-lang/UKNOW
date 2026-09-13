/**
 * telegramGateway.client.js
 *
 * Thin facade over the in-process Telegram channel gateway. Replaces
 * the previous implementation which spawned a Python FastAPI
 * subprocess.
 *
 * The public surface (methods + behaviour) is intentionally identical
 * to the old wrapper so the rest of the codebase does not need to
 * change. Every method is now a direct in-process function call; no
 * HTTP loopback, no shared secret on the wire.
 *
 * Differences vs the old implementation:
 *   - `isConfigured()` reflects whether the in-process gateway has a
 *     shared secret set, not whether a remote URL is configured.
 *   - `baseUrl` getter returns the literal string 'in-process'.
 *   - There is no subprocess; lifecycle hooks are installed by the
 *     bootstrap module (`inProcChannelGateway/index.js`).
 */

import {
  getChannelGateway,
  configureChannel,
  installLifecycleHooks,
} from './inProcChannelGateway/index.js';

const logError = (msg, meta) => (meta !== undefined ? console.error(msg, meta) : console.error(msg));

// Install signal hooks eagerly so SIGTERM/SIGINT also tears down the
// in-process gateway. The bootstrap module also does this but it is
// idempotent — calling again is a no-op.
installLifecycleHooks();
configureChannel('telegram', {});

const gateway = getChannelGateway('telegram');

function wrap(name, fn) {
  return async (...args) => {
    try {
      const result = await fn(...args);
      // Preserve the axios-style `{ data }` envelope so call sites that
      // used to consume a real HTTP response continue to work unchanged.
      if (result && typeof result === 'object' && 'data' in result) {
        return result;
      }
      return { data: result };
    } catch (err) {
      const status = err?.status || err?.response?.status || 502;
      const detail = err?.response?.data?.detail || err?.message;
      logError(`[TelegramGateway] ${name} failed`, { status, detail });
      const wrapped = new Error(
        detail ? `${name}: ${detail}` : `${name} failed: ${err.message}`
      );
      wrapped.status = status;
      wrapped.cause = err;
      throw wrapped;
    }
  };
}

const telegramGateway = {
  isConfigured: () => gateway.isConfigured(),
  baseUrl: 'in-process',

  createSession: wrap('createSession', (userId) => gateway.createSession(userId)),

  getStatus: wrap('getStatus', (sessionId) => gateway.getStatus(sessionId)),

  cancelSession: wrap('cancelSession', (sessionId) => gateway.cancelSession(sessionId)),

  listAccounts: wrap('listAccounts', () => gateway.listAccounts()),

  deleteAccount: wrap('deleteAccount', (telegramUserId) =>
    gateway.deleteAccount(telegramUserId)
  ),

  bindAccount: wrap('bindAccount', (telegramUserId, accountId) =>
    gateway.bindAccount(telegramUserId, accountId)
  ),

  sendMessage: wrap('sendMessage', (telegramUserId, chatId, text) =>
    gateway.sendMessage(telegramUserId, chatId, text)
  ),

  ensureHandler: wrap('ensureHandler', (telegramUserId) => gateway.ensureHandler(telegramUserId)),

  /**
   * Test-only / migration aid: returns the raw in-process facade.
   */
  _internal: gateway,
};

export default telegramGateway;
