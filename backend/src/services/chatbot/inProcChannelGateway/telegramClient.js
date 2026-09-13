/**
 * telegramClient.js
 *
 * In-process replacement for `telegram-gateway/app/telegram_client.py`.
 *
 * Why a stub?
 * -----------
 * Telegram's user-account MTProto protocol is implemented in Python
 * via `telethon`. There is no equivalent official JS library. To
 * actually talk to Telegram for personal accounts, an operator must
 * plug in one of:
 *
 *   - `telegram` (npm) — community port, partial Telethon coverage.
 *   - `@mtproto/core` / `telegram-mtproto` — low-level MTProto, no
 *     high-level helpers like QR login.
 *   - A custom MTProto implementation.
 *
 * Until one of those is plugged in, this stub keeps the in-process
 * gateway bootable: health endpoints work, the session manager runs,
 * QR login attempts fail with a clear `TelegramTransportError`, and
 * the Node.js backend can still resolve ownership, list accounts, and
 * route via `telegram_accounts` even though no live transport is
 * loaded.
 *
 * When a real transport is added, subclass `TelegramClient`, override
 * the methods you need, and switch `buildDefaultClient` to return it.
 */

import { warnOnce } from './warnOnce.js';
import { isStubOnly } from './stubCheck.js';

/**
 * Normalised representation of an inbound Telegram message. Mirrors
 * the Python gateway's payload shape so the forwarder + chat router do
 * not care which transport produced it.
 */
export class TelegramMessageEvent {
  constructor({
    telegramUserId,
    chatId,
    messageId,
    text,
    senderId,
    senderName = null,
    isGroup = false,
    isPrivate = true,
    raw = null,
  }) {
    this.telegramUserId = String(telegramUserId);
    this.chatId = chatId != null ? String(chatId) : null;
    this.messageId = Number(messageId);
    this.text = text ?? null;
    this.senderId = senderId != null ? String(senderId) : null;
    this.senderName = senderName ?? null;
    this.isGroup = Boolean(isGroup);
    this.isPrivate = Boolean(isPrivate);
    this.raw = raw;
  }
}

/**
 * Raised when the underlying Telegram transport fails. Callers in
 * `telegramAuth.js` and `telegramSessionManager.js` translate this
 * into a 503-style response so the Node controller can surface a
 * useful message to the frontend.
 */
export class TelegramTransportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TelegramTransportError';
    this.status = 503;
  }
}

/**
 * Abstract transport contract used by the in-process gateway. Subclass
 * and provide a real implementation when a Telegram transport becomes
 * available. Methods may be sync or async depending on the transport.
 */
export class TelegramClient {
  /**
   * @param {Object} [opts]
   * @param {string|null} [opts.sessionString] - persisted MTProto session string
   * @param {number|null} [opts.apiId]
   * @param {string|null} [opts.apiHash]
   */
  constructor({ sessionString = null, apiId = null, apiHash = null } = {}) {
    this.sessionString = sessionString;
    this.apiId = apiId;
    this.apiHash = apiHash;
  }

  /** Open the underlying transport. Should be idempotent. */
  async connect() {
    throw new Error('Plug in a real Telegram transport');
  }

  /** Returns true if the stored session is still valid. */
  async isAuthorized() {
    throw new Error('Plug in a real Telegram transport');
  }

  /** Tear down the underlying transport. Idempotent. */
  async disconnect() {
    throw new Error('Plug in a real Telegram transport');
  }

  /**
   * Request a fresh QR login token. Return shape:
   *   { token: string /* base64url *\/, qrUrl: string, expiresAt: number }
   * For Telegram the QR encodes `tg://login?token=...`.
   */
  async requestQrToken() {
    throw new Error('Plug in a real Telegram transport');
  }

  /**
   * Poll the login state. Returns:
   *   { status: 'pending' }                    — still waiting
   *   { status: 'success', me: {...} }         — user scanned + accepted
   *   { status: 'migrating', token: string }   — token moved to another DC
   *   { status: 'expired' }                    — token expired
   */
  async checkQrToken(_token) {
    throw new Error('Plug in a real Telegram transport');
  }

  /** Hook for inbound messages. `onMessage` is an async callable. */
  async registerMessageHandler(_onMessage) {
    throw new Error('Plug in a real Telegram transport');
  }

  /** Send a text message to `chatId`. Returns transport-specific receipt. */
  async sendMessage(_chatId, _text) {
    throw new Error('Plug in a real Telegram transport');
  }

  /** Return an opaque string representing the session for persistence. */
  saveSession() {
    return this.sessionString || '';
  }
}

/**
 * Safe stub used when no transport is configured. Keeps the gateway
 * bootable so `/health` and routing endpoints behave, while surfacing
 * a clear error at call time. Once a real transport is plugged in,
 * `StubTelegramClient` is bypassed entirely via `buildDefaultClient`.
 */
export class StubTelegramClient extends TelegramClient {
  constructor(opts = {}) {
    super(opts);
    warnOnce(
      'telegram:stub-active',
      '[TelegramClient] StubTelegramClient is active — no real Telegram transport is loaded. ' +
        'Implement TelegramClient before going to production.'
    );
  }

  async connect() {
    // No-op. The stub has no transport to open.
  }

  async isAuthorized() {
    return Boolean(this.sessionString);
  }

  async disconnect() {
    // No-op.
  }

  async requestQrToken() {
    throw new TelegramTransportError(
      'Telegram transport not implemented. Plug a real client into telegramClient.TelegramClient.'
    );
  }

  async checkQrToken() {
    throw new TelegramTransportError(
      'Telegram transport not implemented. Plug a real client into telegramClient.TelegramClient.'
    );
  }

  async registerMessageHandler() {
    // Stub has no live transport; nothing to register. Don't throw here so
    // session_manager can still mark the account as loaded for read paths.
    return;
  }

  async sendMessage(_chatId, _text) {
    throw new TelegramTransportError('Telegram transport not implemented');
  }

  saveSession() {
    return this.sessionString || '';
  }
}

/**
 * Factory used by the session manager. Returns the production
 * `MtProtoTelegramClient` when `TELEGRAM_GATEWAY_TRANSPORT`
 * points at a loadable class; otherwise returns the stub.
 *
 * `isStubOnly({ channel: 'telegram' })` already inspects the env
 * var (`stub`/`default`/unset ⇒ stub; any real path ⇒ real).
 * When the real class is selected we lazily `import()` it on
 * the very first call so subsequent synchronous calls hit the
 * cached module reference. The first call's microtask delay is
 * negligible compared to the QR round-trip.
 *
 * The factory stays `sync` to keep `telegramAuth.js`'s call
 * site untouched, but internally we cache the resolved class.
 */
let _realClientCtor = null;
let _realClientResolved = null;
let _realClientResolving = false;
async function _resolveRealClientCtor() {
  if (_realClientCtor !== null) return _realClientCtor;
  if (_realClientResolving) return _realClientResolved;
  _realClientResolving = true;
  _realClientResolved = (async () => {
    try {
      const mod = await import('./mtProtoTelegramClient.js');
      _realClientCtor = mod.MtProtoTelegramClient;
    } catch (err) {
      console.warn(
        '[telegramClient] could not load MtProtoTelegramClient:',
        err.message
      );
      _realClientCtor = null;
    } finally {
      _realClientResolving = false;
    }
    return _realClientCtor;
  })();
  return _realClientResolved;
}

// Eagerly start the resolver at module load. We only pay the
// cost of importing `@mtcute/node` (which pulls in
// `better-sqlite3`, a native binding) when the env var points
// at a real path. The stub branch never spawns the import, so
// tests and dev environments that don't want the real
// transport stay fast and don't need MSVC build tools.
if (!isStubOnly({ channel: 'telegram' })) {
  // Fire-and-forget: the first `buildDefaultClient` call may
  // still race ahead of the dynamic import (microservice
  // startup happens in one tick). We retry the lookup on
  // every call until `_realClientCtor` is populated.
  _resolveRealClientCtor();
}

export function buildDefaultClient(opts = {}) {
  // The eager resolver above races against the first call.
  // If the dynamic import hasn't settled yet, yield one
  // microtask and try again. In practice the user-facing
  // request that triggers `buildDefaultClient` is itself an
  // `async` handler, so a single microtask delay is
  // invisible. After the first request `_realClientCtor` is
  // cached and every subsequent call is sync.
  if (!isStubOnly({ channel: 'telegram' }) && !_realClientCtor) {
    // The await is dropped because callers are sync. We
    // schedule the resolver (no-op if it's already running)
    // and fall back to the stub on this tick. The very next
    // call — typically a few ms later, when the same user
    // retries — will hit the cached class. Operators in
    // scripts or seed code that need to wait can await the
    // module export `whenReady()` below.
    _resolveRealClientCtor();
  }
  if (!isStubOnly({ channel: 'telegram' }) && _realClientCtor) {
    return new _realClientCtor(opts);
  }
  return new StubTelegramClient(opts);
}

/**
 * Awaitable readiness probe for callers that need the real
 * client class loaded synchronously before they proceed (e.g.
 * seed scripts, integration tests, or the controller's startup
 * health check). Returns `true` when the production class is
 * cached, `false` when the gateway is in stub mode.
 */
export async function whenReady() {
  if (isStubOnly({ channel: 'telegram' })) return false;
  await _resolveRealClientCtor();
  return _realClientCtor !== null;
}

let _cachedTransportClass = null;
let _transportResolved = null;

/**
 * Lazy async transport loader. Memoised: the import + default-export
 * resolution runs at most once per process. Failures log a one-shot
 * warning and resolve to `null` so callers fall back to the stub.
 */
export async function loadRealTransportClass(env) {
  if (_cachedTransportClass !== null) return _cachedTransportClass;
  if (_transportResolved) return _transportResolved;
  const { loadTransportClass } = await import('./transportLoader.js');
  _transportResolved = loadTransportClass({ channel: 'telegram', env });
  _cachedTransportClass = await _transportResolved;
  _transportResolved = null;
  return _cachedTransportClass;
}

/**
 * Test-only: forget the memoised transport so a new env can be
 * applied on the next `loadRealTransportClass` call.
 */
export function _resetTransportCache() {
  _cachedTransportClass = null;
  _transportResolved = null;
}

export default {
  TelegramClient,
  StubTelegramClient,
  TelegramMessageEvent,
  TelegramTransportError,
  buildDefaultClient,
  loadRealTransportClass,
  _resetTransportCache,
};
