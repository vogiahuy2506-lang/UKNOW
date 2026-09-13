/**
 * telegramSessionManager.js
 *
 * In-process replacement for `telegram-gateway/app/session_manager.py`.
 * Manages a pool of `TelegramClient` instances keyed by
 * `telegram_user_id` so concurrent commands for the same account are
 * serialised while idle clients are evicted by a background timer.
 *
 * Diff vs the Python version:
 *   - No `asyncio.Semaphore` to cap concurrency: the stub transport
 *     does no network work, so the global cap is meaningless today.
 *     When a real transport is plugged in, the semaphore can return.
 *   - Per-account lock is a Promise queue (since JS is single-threaded
 *     we just chain `.then` to serialise calls without blocking).
 *   - Idle eviction uses `setInterval` instead of an asyncio task.
 */

import { buildDefaultClient, TelegramTransportError, whenReady } from './telegramClient.js';

// `telegramMtProtoStorage.js` imports `@mtcute/core`, which has a
// transitive dependency on the native `long` package. We pull it
// in lazily so tests and stub-mode boots that never touch a real
// session (e.g. `isStubOnly.spec.js`, the health endpoint) don't
// pay the import cost. The dynamic `import()` is memoised so the
// second call is free.
let _mtProtoStorageModule = null;
async function loadMtProtoStorageModule() {
  if (_mtProtoStorageModule) return _mtProtoStorageModule;
  _mtProtoStorageModule = await import('./telegramMtProtoStorage.js');
  return _mtProtoStorageModule;
}

const logInfo = (msg, meta) =>
  meta !== undefined ? console.log(msg, meta) : console.log(msg);
const logWarn = (msg) => console.warn(msg);

const DEFAULT_MAX_CONCURRENT_CLIENTS = Number(
  process.env.TELEGRAM_GATEWAY_MAX_CONCURRENT || 500
);
const DEFAULT_IDLE_DISCONNECT_MINUTES = Number(
  process.env.TELEGRAM_GATEWAY_IDLE_MINUTES || 5
);

/**
 * One connected Telegram client wrapped with per-account serialisation.
 */
class ClientRecord {
  constructor({ accountKey, client }) {
    this.accountKey = String(accountKey);
    this.client = client;
    this.lastUsed = Date.now();
    // Promise-chain queue: serialises all operations on this client.
    this._tail = Promise.resolve();
  }

  /**
   * Run an async function exclusively for this client. Concurrent
   * calls for the same client will queue in submission order.
   */
  exec(fn) {
    const next = this._tail.then(() => fn());
    // Swallow rejections on the chain itself so one failed op does not
    // poison subsequent ones. The caller's promise still sees the error.
    this._tail = next.catch(() => {});
    return next;
  }

  touch() {
    this.lastUsed = Date.now();
  }
}

export class TelegramSessionManager {
  /**
   * @param {Object} deps
   * @param {Object} deps.sessionRepo - Anything that can fetch a stored
   *   session blob. Must implement:
   *     getSessionString(telegramUserId, { userId }?)
   *     clearSessionString(telegramUserId)
   *   `chatbotTelegramRepository` works out of the box.
   * @param {Object} [deps.telegramCreds]
   * @param {number} [deps.telegramCreds.apiId]
   * @param {string} [deps.telegramCreds.apiHash]
   * @param {Object} [deps.inboxForwarder] - Forwarder that POSTs
   *   normalised inbound events to `/api/internal/telegram-webhook`.
   *   Optional so the unit tests can stub the transport without
   *   wiring HTTP. When provided, the session manager subscribes
   *   each restored client to the transport's onNewMessage signal
   *   and pipes every event through this forwarder.
   * @param {Object} [deps.config]
   * @param {number} [deps.config.maxConcurrentClients]
   * @param {number} [deps.config.idleDisconnectMinutes]
   */
  constructor({ sessionRepo, telegramCreds = {}, inboxForwarder = null, config = {} } = {}) {
    if (!sessionRepo) {
      throw new Error(
        '[TelegramSessionManager] sessionRepo is required — pass chatbotTelegramRepository.'
      );
    }
    this._clients = new Map();
    this._sessionRepo = sessionRepo;
    this._telegramCreds = telegramCreds;
    this._inboxForwarder = inboxForwarder;
    this._config = {
      maxConcurrentClients: config.maxConcurrentClients ?? DEFAULT_MAX_CONCURRENT_CLIENTS,
      idleDisconnectMinutes:
        config.idleDisconnectMinutes ?? DEFAULT_IDLE_DISCONNECT_MINUTES,
    };
    this._idleTimer = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  start() {
    if (this._idleTimer) return;
    this._idleTimer = setInterval(() => this._evictIdle().catch(() => {}), 60_000);
    if (typeof this._idleTimer.unref === 'function') this._idleTimer.unref();
  }

  /**
   * Eagerly restore every persisted Telegram session from the
   * database. Without this the in-process transport would only
   * spin up clients lazily on the next `sendMessage()` call, which
   * means inbound messages — the whole point of the personal
   * account channel — would never be received for accounts that
   * are not actively sending.
   *
   * Restoring is best-effort: per-account failures are logged and
   * swallowed so one bad row doesn't block the rest.
   *
   * @param {Object} [opts]
   * @param {number} [opts.userId] - Optional owner filter so
   *   multi-tenant deployments can scope restoration to one
   *   workspace. Currently unused; kept for forward-compat.
   * @returns {Promise<{ restored: number, failed: number }>}
   */
  async restoreSessionsFromDb({ userId: _userId = null } = {}) {
    let keys;
    if (typeof this._sessionRepo.listAllSessionStateKeys === 'function') {
      // Preferred path — fetches just the keys ordered by
      // most-recently-active, avoiding the JOIN with
      // `telegram_accounts` that `listAllSessions` does. Keeps
      // boot time O(1) round-trip regardless of how many
      // accounts exist.
      keys = await this._sessionRepo.listAllSessionStateKeys();
    } else if (typeof this._sessionRepo.listAllSessions === 'function') {
      // Legacy fallback — used by tests/mocks that haven't been
      // updated yet. Maps back to the same key shape.
      const rows = await this._sessionRepo.listAllSessions();
      keys = rows
        .map((r) => Number(r.telegram_user_id))
        .filter((n) => Number.isFinite(n));
    } else {
      logWarn(
        '[TelegramSessionManager] sessionRepo missing both listAllSessionStateKeys and listAllSessions — skipping eager restore'
      );
      return { restored: 0, failed: 0 };
    }
    let restored = 0;
    let failed = 0;
    for (const telegramUserId of keys) {
      if (!Number.isFinite(telegramUserId)) {
        failed += 1;
        continue;
      }
      try {
        const client = await this.getClient(telegramUserId);
        if (client) restored += 1;
      } catch (err) {
        failed += 1;
        logWarn(
          `[TelegramSessionManager] restore failed for ${telegramUserId}: ${err.message}`
        );
      }
    }
    logInfo(
      `[TelegramSessionManager] restored ${restored}/${keys.length} telegram clients (failed=${failed})`
    );
    return { restored, failed };
  }

  async stop() {
    if (this._idleTimer) {
      clearInterval(this._idleTimer);
      this._idleTimer = null;
    }
    for (const record of this._clients.values()) {
      try {
        await record.client.disconnect();
      } catch {
        // best-effort
      }
    }
    this._clients.clear();
  }

  // ── Public API ────────────────────────────────────────────────────────

  /**
   * Return the connected client for `telegramUserId`, hydrating it
   * from the persisted session blob if necessary. Returns `null` if
   * no session is stored or the stored session is no longer
   * authorised.
   */
  async getClient(telegramUserId) {
    const key = String(telegramUserId);
    const existing = this._clients.get(key);
    if (existing) {
      existing.touch();
      return existing.client;
    }

    // Check up-front whether we have anything to hydrate. The
    // Postgres-backed driver would also return an empty in-memory
    // state if the row is missing, but the early-out saves a DB
    // round-trip and lets the caller distinguish "first QR scan"
    // (no row) from "row exists, decrypt failed".
    const sessionBlob = await this._sessionRepo.getSessionString(
      Number(telegramUserId)
    );
    if (!sessionBlob) return null;

    // Build a Postgres-backed storage provider so mtcute reads +
    // writes the encrypted JSONB row instead of touching the
    // on-disk SQLite file at `.telegram-sessions/<key>/`. The
    // provider is constructed even when `sessionBlob` was a
    // legacy plaintext marker (because `getSessionString` returns
    // null on a parse failure, this only runs when a real row
    // exists — so the provider will load() a non-empty blob).
    // Lazy-imported so the module file stays free of `@mtcute/core`
    // in stub mode / health probes.
    const { PostgresBackedTelegramStorage } = await loadMtProtoStorageModule();
    const storageProvider = new PostgresBackedTelegramStorage({
      telegramUserId,
      repo: this._sessionRepo,
    });

    // Wait for the production client class to settle before we
    // instantiate it. Without this, the first request after boot
    // would race the dynamic `import()` of `@mtcute/node` and get
    // back a stub instance.
    await whenReady();
    const client = buildDefaultClient({
      apiId: this._telegramCreds.apiId,
      apiHash: this._telegramCreds.apiHash,
      storageProvider,
      storageKey: `tg-${telegramUserId}`,
    });
    try {
      await client.connect();
    } catch (err) {
      logWarn(
        `[TelegramSessionManager] connect failed for ${telegramUserId}: ${err.message}`
      );
      return null;
    }

    let authorised = false;
    try {
      authorised = await client.isAuthorized();
    } catch (err) {
      logWarn(
        `[TelegramSessionManager] isAuthorized failed for ${telegramUserId}: ${err.message}`
      );
      authorised = false;
    }
    if (!authorised) {
      logWarn(
        `[TelegramSessionManager] stored session for ${telegramUserId} is no longer authorised`
      );
      try {
        await client.disconnect();
      } catch {
        // best-effort
      }
      try {
        await this._sessionRepo.clearSessionString(Number(telegramUserId));
      } catch {
        // best-effort
      }
      return null;
    }

    const record = new ClientRecord({ accountKey: key, client });
    this._clients.set(key, record);

    // Wire the transport's inbound messages to the in-process
    // forwarder. Without this, restored clients would happily
    // receive updates via the MTProto socket but the webhook
    // route — which is the entry point for AI routing, debounce,
    // and reply orchestration — would never see them, so the AI
    // would stay silent. The handler is fire-and-forget: the
    // forwarder swallows network errors so a transient backend
    // crash does not stop new messages from being received.
    if (this._inboxForwarder && typeof client.registerMessageHandler === 'function') {
      try {
        await client.registerMessageHandler(
          (event) => this._forwardInbound(event, telegramUserId),
          { accountTelegramUserId: telegramUserId }
        );
        logInfo(
          `[TelegramSessionManager] subscribed inbound handler for ${telegramUserId}`
        );
      } catch (err) {
        logWarn(
          `[TelegramSessionManager] registerMessageHandler failed for ${telegramUserId}: ${err.message}`
        );
      }
    }

    logInfo(`[TelegramSessionManager] restored client for ${telegramUserId}`);
    return client;
  }

  /**
   * Hand a normalised inbound event from the transport off to the
   * forwarder. Translates `TelegramMessageEvent` (camelCase) into
   * the snake_case wire shape `telegramAdapter.parseWebhookEvent`
   * expects (mirrors the legacy Python gateway payload).
   */
  async _forwardInbound(event, accountTelegramUserId) {
    if (!this._inboxForwarder) return;
    try {
      await this._inboxForwarder.forward({
        telegram_user_id: accountTelegramUserId,
        chat_id: event.chatId,
        message_id: event.messageId,
        text: event.text || '',
        sender_id: event.senderId,
        sender_name: event.senderName,
        is_group: event.isGroup,
        is_private: event.isPrivate,
      });
    } catch (err) {
      // Forwarder is supposed to swallow its own errors; this is
      // belt-and-braces so a buggy forwarder can't crash the
      // mtcute dispatch loop.
      logWarn(
        `[TelegramSessionManager] forwardInbound threw for ${accountTelegramUserId}: ${err.message}`
      );
    }
  }

  /**
   * Send a text message via the connected client. Throws if no live
   * session exists.
   */
  async sendMessage(telegramUserId, chatId, text) {
    const client = await this.getClient(telegramUserId);
    if (!client) {
      throw new TelegramTransportError(
        `No active session for telegram_user_id=${telegramUserId}`
      );
    }
    const record = this._clients.get(String(telegramUserId));
    return record.exec(() => client.sendMessage(chatId, text));
  }

  /**
   * Disconnect and drop the in-memory client. Does NOT touch the
   * stored blob — caller decides whether to delete it.
   */
  async disconnect(telegramUserId) {
    const key = String(telegramUserId);
    const record = this._clients.get(key);
    if (!record) return false;
    this._clients.delete(key);
    try {
      await record.client.disconnect();
    } catch {
      // best-effort
    }
    return true;
  }

  isLoaded(telegramUserId) {
    return this._clients.has(String(telegramUserId));
  }

  listActiveClients() {
    return Array.from(this._clients.keys());
  }

  // ── Internals ─────────────────────────────────────────────────────────

  async _evictIdle() {
    const cutoff = Date.now() - this._config.idleDisconnectMinutes * 60_000;
    const stale = [];
    for (const [key, record] of this._clients.entries()) {
      if (record.lastUsed < cutoff) stale.push(key);
    }
    for (const key of stale) {
      const record = this._clients.get(key);
      if (!record) continue;
      this._clients.delete(key);
      try {
        await record.client.disconnect();
      } catch {
        // best-effort
      }
      logInfo(`[TelegramSessionManager] disconnected idle client ${key}`);
    }
  }
}

let _singleton = null;
let _singletonDeps = null;

export function getTelegramSessionManager(
  sessionRepo,
  telegramCreds,
  inboxForwarder,
  config
) {
  // Re-build the singleton when the deps change so callers that
  // plug a real forwarder in after boot (the typical case for the
  // in-process channel gateway bootstrap) actually receive it.
  if (
    !_singleton ||
    !_singletonDeps ||
    _singletonDeps.sessionRepo !== sessionRepo ||
    _singletonDeps.inboxForwarder !== inboxForwarder
  ) {
    _singleton = new TelegramSessionManager({
      sessionRepo,
      telegramCreds,
      inboxForwarder,
      config,
    });
    _singletonDeps = { sessionRepo, inboxForwarder };
  }
  return _singleton;
}

/**
 * Test-only: drop the singleton so a fresh config can be injected.
 */
export function _resetTelegramSessionManager() {
  _singleton = null;
}

export default { TelegramSessionManager, getTelegramSessionManager };
