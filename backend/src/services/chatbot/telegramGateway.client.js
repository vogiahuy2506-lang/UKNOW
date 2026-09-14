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
      // Bug trước: fallback `|| 502` "nâng cấp" mọi error không có status
      // (vd. mtcute native throw, import() fail, plain Error từ
      // `client.connect()`/`requestQrToken()`) thành 502 Bad Gateway. 502
      // về ngữ nghĩa chỉ dành cho proxy/upstream fail — backend xử lý
      // lỗi nội bộ phải trả 500 mới đúng. Ngoài ra FE axios mặc định
      // reject với status 5xx → "Request failed with status code 502"
      // che đi message thật ("cannot reach Telegram DC", "AUTH_KEY_DUPLICATED",
      // ...), operator không biết root cause.
      //
      // Áp dụng cho cả `wrap()` lẫn `guard()`: ưu tiên `err.status` (đã
      // chủ động set cho timeout/transport errors), rồi axios-style
      // `response.status`, mặc định 500 cho mọi trường hợp còn lại.
      const status = err?.status || err?.response?.status || 500;
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

/**
 * Wrap a gateway method that requires the gateway to be configured first.
 * If `gateway.isConfigured()` is false, throw a clean 503-style error BEFORE
 * touching the DB / underlying client. This mirrors the old embedded-mode
 * behaviour where calls without TELEGRAM_GATEWAY_URL/SECRET failed fast
 * instead of returning empty lists that look healthy.
 */
function guard(name, fn) {
  return async (...args) => {
    if (!gateway.isConfigured()) {
      const err = new Error('Telegram gateway is not configured on the backend');
      err.status = 503;
      throw err;
    }
    return wrap(name, fn)(...args);
  };
}

const telegramGateway = {
  isConfigured: () => gateway.isConfigured(),
  baseUrl: 'in-process',

  createSession: wrap('createSession', (userId) => gateway.createSession(userId)),

  getStatus: wrap('getStatus', (sessionId) => gateway.getStatus(sessionId)),

  cancelSession: wrap('cancelSession', (sessionId) => gateway.cancelSession(sessionId)),

  listAccounts: guard('listAccounts', () => gateway.listAccounts()),

  deleteAccount: guard('deleteAccount', (telegramUserId) =>
    gateway.deleteAccount(telegramUserId)
  ),

  bindAccount: guard('bindAccount', (telegramUserId, accountId) =>
    gateway.bindAccount(telegramUserId, accountId)
  ),

  sendMessage: guard('sendMessage', (telegramUserId, chatId, text) =>
    gateway.sendMessage(telegramUserId, chatId, text)
  ),

  ensureHandler: guard('ensureHandler', (telegramUserId) => gateway.ensureHandler(telegramUserId)),

  /**
   * Test-only / migration aid: returns the raw in-process facade.
   */
  _internal: gateway,
};

export default telegramGateway;
