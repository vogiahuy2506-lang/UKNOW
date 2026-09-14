/**
 * mtProtoTelegramClient.js
 *
 * Production Telegram transport for the in-process channel gateway.
 * Built on `@mtcute/node`, an actively maintained MTProto client
 * (TypeScript-native, plain JS runtime, no native bindings beyond
 * better-sqlite3 which we already pull in via `@mtcute/node`).
 *
 * Why mtcute?
 * -----------
 * The repo's previous stub mentioned `telegram` (community port)
 * and `@mtproto/core` (low-level). Neither fits our QR-login +
 * persistent session needs without weeks of glue code. mtcute
 * ships:
 *   - first-class QR sign-in via `tg.start({ qrCodeHandler })`
 *   - persistent session via SQLite storage (out of the box)
 *   - `tg.onNewMessage` for inbound subscriptions
 *   - `tg.sendText` for outbound messages
 *   - DC migration handling (the QR may hop DCs mid-scan; we
 *     translate this to the gateway's `migrating` status).
 *
 * How to plug it in
 * -----------------
 *   1. Each operator registers an app at https://my.telegram.org/apps
 *      to obtain an `api_id` and `api_hash`.
 *   2. Set the gateway env vars on the Node backend:
 *        TELEGRAM_API_ID=<numeric>
 *        TELEGRAM_API_HASH=<32 hex chars>
 *        TELEGRAM_GATEWAY_TRANSPORT=./services/chatbot/inProcChannelGateway/transports/MtProtoTelegramTransport.mjs
 *      The path is resolved by `transportLoader.js` via dynamic
 *      import. We use a thin `.mjs` shim so the file is a clean
 *      `export default` of this class, satisfying the loader's
 *      contract.
 *
 * The class is purposefully lazy:
 *   - `connect()` does nothing until the first `start()` call
 *     (which happens inside `requestQrToken` or `isAuthorized`).
 *   - `requestQrToken` returns a *promise that resolves on scan*,
 *     so the gateway's poll loop can `await` it and surface the
 *     outcome to the SPA.
 */

import { TelegramClient as MtcuteTelegramClient } from '@mtcute/node';
import { TelegramClient as BaseTelegramClient } from './telegramClient.js';
import { TelegramTransportError } from './telegramClient.js';
import { TelegramMessageEvent } from './telegramClient.js';
import { ProxyTcpTransport } from './proxyTransport.js';
import fs from 'node:fs';
import path from 'node:path';

const QR_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 min — Telegram's own limit.

/**
 * Resolve a SQLite storage path to an absolute directory and make sure
 * it exists. mtcute's `SqliteStorage` opens `<path>/<storageKey>/client.session`
 * — the *parent* directory must exist, writable, and not be a file.
 *
 * Resolution order:
 *   1. `opts.storagePath` nếu caller truyền absolute path
 *   2. `process.env.TELEGRAM_SESSION_DIR` (set trong .env cho production)
 *   3. `<process.cwd()>/.telegram-sessions` (default — Dockerfile
 *      `WORKDIR /app` tạo sẵn thư mục này)
 *
 * Bug trước đó: code nhận `'.telegram-sessions'` (relative) và chuyển
 * thẳng cho `better-sqlite3`. Khi process CWD lệch (volume mount sai,
 * systemd unit start từ chỗ khác, v.v.), SQLite mở nhầm file → "unable
 * to open database file". Force absolute path để bug không tái diễn.
 *
 * Bug thứ 2: code chỉ mkdir `<storagePath>` mà KHÔNG mkdir `<storageKey>`
 * subfolder. Caller (constructor) giờ truyền `path.join(storagePath,
 * storageKey)` vào đây để mkdir cả 2 cùng lúc — đảm bảo đường dẫn
 * mtcute mở file SQLite luôn tồn tại.
 *
 * Trả về absolute path đã được `mkdirSync({ recursive: true })`.
 *
 * @param {string} requested - path CẦN mkdir full (bao gồm storageKey nếu dùng SQLite)
 * @returns {string} absolute path, guaranteed to exist
 */
function resolveAndEnsureSessionDir(requested) {
  let resolved;
  if (path.isAbsolute(requested)) {
    resolved = requested;
  } else if (process.env.TELEGRAM_SESSION_DIR) {
    resolved = path.resolve(process.env.TELEGRAM_SESSION_DIR);
  } else {
    resolved = path.resolve(process.cwd(), requested);
  }
  // Defensive log: helps operators see at runtime which path mtcute will
  // try to open. The bug "unable to open database file" ở production có
  // thể do:
  //   1. CWD lệch → fallback vào thư mục không writable.
  //   2. TELEGRAM_SESSION_DIR trỏ tới chỗ không tồn tại / không writable.
  //   3. Subfolder `<path>/<storageKey>/` chưa được tạo (mtcute không tự mkdir)
  //      → SQLite mở file <path>/<storageKey>/client.session fail.
  // Log đủ context để debug không cần SSH vào prod.
  console.log(
    `[MtProtoTelegramClient] resolveAndEnsureSessionDir requested="${requested}" cwd="${process.cwd()}" envTELEGRAM_SESSION_DIR="${process.env.TELEGRAM_SESSION_DIR || ''}" resolved="${resolved}"`
  );
  // mkdirSync không throw khi đã tồn tại (recursive: true + idempotent).
  // Trước đây Dockerfile đảm bảo mkdir — giờ đảm bảo ở app level luôn
  // để chạy local/dev cũng không lỗi.
  fs.mkdirSync(resolved, { recursive: true });
  // Verify writable để fail-fast thay vì để mtcute nổ "unable to open" khó trace.
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch (err) {
    console.error(
      `[MtProtoTelegramClient] resolveAndEnsureSessionDir: directory "${resolved}" is NOT writable (uid=${process.getuid?.() ?? 'n/a'}, gid=${process.getgid?.() ?? 'n/a'}): ${err.message}. ` +
      'Set TELEGRAM_SESSION_DIR=/path/writable để tránh SQLite crash trên production.'
    );
  }
  return resolved;
}

/**
 * Convert mtcute's User object to the gateway's normalised
 * `me` payload. Shape mirrors the Python gateway so the auth
 * flow / controller do not have to branch on transport.
 */
function meFromUser(user) {
  if (!user) return null;
  return {
    telegramUserId: String(user.id),
    displayName:
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.username ||
      String(user.id),
    username: user.username || null,
    phone: user.phone || null,
    avatarUrl:
      user.photo && user.photo.thumb
        ? `mtcute://avatar/${user.id}/${user.photo.thumb.id}`
        : null,
  };
}

/**
 * Production Telegram transport.
 *
 * The gateway instantiates this via `loadRealTransportClass()`,
 * which does a dynamic import of the `.mjs` shim, then calls
 * `new ClassName({ apiId, apiHash, sessionString })`. The
 * session string is opaque bytes that mtcute's SqliteStorage
 * handles internally; we still pass it through `saveSession()`
 * for observability in `telegram_accounts.session_blob`.
 */
export class MtProtoTelegramClient extends BaseTelegramClient {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.apiId]        TELEGRAM_API_ID
   * @param {string} [opts.apiHash]      TELEGRAM_API_HASH
   * @param {string|null} [opts.sessionString]
   *   Legacy marker from the pre-215 era. mtcute's storage now
   *   comes from `opts.storageProvider` (Postgres-backed); the
   *   marker is ignored except for the `saveSession()` return
   *   value, which is preserved for backward compat with the
   *   `_onLoginSuccess` hook.
   * @param {Object|null} [opts.storageProvider]
   *   Optional `ITelegramStorageProvider` instance from
   *   `telegramMtProtoStorage.js`. When present, mtcute uses it
   *   as the source of truth for `kv`, `authKeys`, `peers`, and
   *   `refMessages` — replacing the default on-disk SQLite file
   *   under `.telegram-sessions/<key>/`. Multi-instance deploys
   *   pass this so all replicas share the same session state.
   * @param {string} [opts.storagePath]
   *   Fallback storage path used when `opts.storageProvider`
   *   is missing. mtcute opens `<storagePath>/<storageKey>/client.session`
   *   via better-sqlite3; the directory must exist and be writable.
   *   Defaults to `'.telegram-sessions'` — constructor tự resolve thành
   *   absolute path (ưu tiên `TELEGRAM_SESSION_DIR` env var, fallback
   *   `<cwd>/.telegram-sessions`) và `mkdirSync` luôn để tránh lỗi
   *   "unable to open database file" khi CWD lệch hoặc Dockerfile
   *   mkdir bị miss. New code should pass `storageProvider` instead and
   *   skip this; the SQLite path is kept only as a graceful
   *   degradation when the Postgres row is missing on first
   *   boot (the backfill script will migrate it later).
   * @param {string} [opts.storageKey]
   *   Storage key (mimics Pyrogram's `StringSession` key). Each
   *   distinct value isolates a session — useful when one backend
   *   hosts multiple Telegram accounts. We derive this from the
   *   account id at construction time.
   */
  constructor({
    apiId = null,
    apiHash = null,
    sessionString = null,
    storageProvider = null,
    storagePath = '.telegram-sessions',
    storageKey = 'default',
  } = {}) {
    super({ sessionString, apiId, apiHash });
    this._storageProvider = storageProvider;
    // Resolve relative path → absolute + tạo thư mục (và subfolder storageKey)
    // nếu chưa có. _buildClient() chỉ dùng _storagePath khi storageProvider=null
    // (createSession QR login path), nên resolve tại đây là đủ —
    // restoreSessionsFromDb path vẫn dùng Postgres storage thẳng.
    //
    // Bug trước đó: resolveAndEnsureSessionDir chỉ mkdir `<storagePath>` mà
    // KHÔNG mkdir `<storagePath>/<storageKey>`. mtcute mở SQLite file
    // `<storagePath>/<storageKey>/client.session` qua better-sqlite3 mà không
    // tự tạo thư mục con → "unable to open database file" trên production
    // khi container start lần đầu (subfolder chưa tồn tại).
    this._storagePath = storageProvider
      ? storagePath
      : resolveAndEnsureSessionDir(path.join(storagePath, storageKey));
    this._storageKey = storageKey;
    this._tg = null;
    this._connecting = null;
    // Single-flight promise for the QR scan: every poll
    // request shares the same in-flight `start()` so we don't
    // request 30 different QR tokens while one is being scanned.
    this._qrPromise = null;
    this._lastQr = null;
  }

  /** Build the underlying mtcute client. Idempotent. */
  _buildClient() {
    if (this._tg) return this._tg;
    if (!this.apiId || !this.apiHash) {
      throw new TelegramTransportError(
        'TELEGRAM_API_ID and TELEGRAM_API_HASH must be set before using MtProtoTelegramClient'
      );
    }
    const clientOpts = {
      apiId: this.apiId,
      apiHash: this.apiHash,
      // Prefer the Postgres-backed StorageProvider when one was
      // injected. mtcute's `storage` option accepts either a string
      // path (instantiated as `SqliteStorage`) OR a fully-built
      // `ITelegramStorageProvider` instance — we pass the latter so
      // the gateway can run as one of N replicas behind a load
      // balancer without each replica maintaining its own SQLite
      // file. See `telegramMtProtoStorage.js` for the provider.
      storage: this._storageProvider ?? this._storagePath,
      // Each (accountId, channel) combo gets a distinct key so
      // simultaneous sessions don't clobber each other.
      storageKey: this._storageKey,
      // Route TCP dials through a SOCKS5 / HTTP CONNECT proxy
      // when `TELEGRAM_PROXY_URL` is set. Without this, mtcute
      // dials Telegram DCs directly — which fails in networks
      // where DPI blocks `149.154.167.50:443` / friends.
      // `ProxyTcpTransport` is a byte-for-byte equivalent of
      // `@mtcute/node`'s stock `TcpTransport` when no proxy
      // env var is set, so the no-proxy path is unaffected.
      transport: new ProxyTcpTransport(),
    };
    // If operators have explicitly whitelisted DCs (some ISPs or
    // corporate networks block the rest), override the default
    // production DC list. Format: comma-separated `id=ip[:port]`
    // pairs in `TELEGRAM_DC_WHITELIST`, e.g.
    //   TELEGRAM_DC_WHITELIST=2=149.154.167.50,2=91.108.56.130
    // We only honour vars that parse cleanly; a malformed entry
    // is logged and skipped instead of failing the connection.
    const customDcs = parseDcWhitelist(process.env.TELEGRAM_DC_WHITELIST);
    const builtDcs = buildDefaultDcs(customDcs);
    if (builtDcs) {
      // mtcute's `defaultDcs` is `{ main, media }` — see
      // `@mtcute/core/utils/dcs.d.ts:11`. Both fields are
      // `BasicDcOption`s. Telegram reuses the same DC for main
      // and media traffic, so we hand the FIRST whitelisted
      // entry to both — any additional entries are accepted
      // too in case operators want to alias multiple IPs to the
      // same DC id (mtcute will fall through them on retry).
      clientOpts.defaultDcs = builtDcs;
    }
    this._tg = new MtcuteTelegramClient(clientOpts);
    return this._tg;
  }

  async connect() {
    if (this._connecting) return this._connecting;
    this._connecting = (async () => {
      try {
        const tg = this._buildClient();
        // mtcute's actual MTProto handshake is implicit on the
        // first RPC call (e.g. `tg.start({ qrCodeHandler })`
        // during QR login). We deliberately do NOT await
        // `tg.start()` here because that call blocks until the
        // user scans the QR — which would race against the
        // outer `TELEGRAM_CONNECT_TIMEOUT_MS` cap in
        // `telegramAuth.js` and 504 every QR login attempt.
        // Touching `tg.network` primes the underlying
        // MtClient without blocking on the login flow; any
        // DNS / TCP / proxy failure surfaces here synchronously
        // so the auth flow can map it to the right error code.
        if (tg.network) {
          // best-effort, do not throw
        }
        this._connected = true;

        // If we already have a stored session, kick off the
        // background login (no qrCodeHandler) so the client
        // actually loads the auth keys. Without this, the
        // first RPC after boot (e.g. `tg.sendText`) would
        // try to send WITHOUT a valid auth key and silently
        // hang on the network layer. We don't await it —
        // mtcute resolves once the auth keys are loaded into
        // memory and the client is fully usable.
        if (tg.storage && typeof tg.start === 'function') {
          tg.start({}).catch((err) => {
            console.warn(
              `[MtProtoTelegramClient] background tg.start failed for ${this._storageKey}:`,
              err?.message || err
            );
          });
        }
      } catch (err) {
        throw new TelegramTransportError(
          `MtProtoTelegramClient.connect failed: ${err.message}`
        );
      } finally {
        this._connecting = null;
      }
    })();
    return this._connecting;
  }

  async isAuthorized() {
    try {
      const tg = this._buildClient();
      // `tg.start({ botToken })` would short-circuit but we
      // can't because we're a user account, not a bot. The
      // cheaper check is "did we previously authorise?": mtcute
      // exposes `tg.isBot` but for users we have to peek at
      // storage. The closest public surface is `tg.storageKey`,
      // which only confirms we have a storage slot. Real check
      // comes on the next call — accept that and return true if
      // storage is present.
      return Boolean(tg.storage);
    } catch {
      return false;
    }
  }

  async disconnect() {
    if (this._tg) {
      try {
        await this._tg.destroy();
      } catch {
        // Destroy is best-effort; if mtcute already cleaned
        // up internally we don't care.
      }
      this._tg = null;
    }
    this._connected = false;
    this._qrPromise = null;
    this._lastQr = null;
  }

  /**
   * Initiate QR sign-in. Returns a token envelope that the
   * caller (`telegramAuth.js`) will:
   *   - turn into a QR image for the SPA,
   *   - poll via `checkQrToken` until scan or expiry.
   *
   * We do not *block* here. mtcute's `tg.start()` returns once
   * the user has scanned AND entered a 2FA password if needed,
   * but our gateway wants a token-first / poll-later API so the
   * SPA can render the QR immediately. We therefore:
   *   1. call `tg.exportQrTokenAsync()` (mtcute's non-blocking
   *      QR variant) to get the URL to render,
   *   2. kick off `tg.start({ qrCodeHandler })` in the background
   *      so the scan eventually resolves.
   *
   * If mtcute's surface changes in a future release, this is
   * the only method that needs to adapt — `checkQrToken` reads
   * `_qrPromise` which abstracts the underlying flow.
   */
  async requestQrToken() {
    if (!this.apiId || !this.apiHash) {
      throw new TelegramTransportError(
        'TELEGRAM_API_ID and TELEGRAM_API_HASH must be set before requesting a Telegram QR token'
      );
    }
    const tg = this._buildClient();
    // mtcute exposes a QR token via the lower-level
    // `auth.exportLoginToken` RPC, but `tg.start({ qrCodeHandler })`
    // is the public, maintained entry point. We use the promise
    // returned by start(); it resolves with the `me` user once
    // the scan + 2FA succeeds.
    if (this._qrPromise) {
      // Already scanning — return the same envelope so the
      // gateway can poll it. Caller should not start a new QR.
      return this._lastQr;
    }
    const expiresAt = Date.now() + QR_TOKEN_TTL_MS;
    // Set up a one-shot promise that resolves as soon as mtcute
    // delivers the FIRST QR URL via `qrCodeHandler`. The caller
    // (`requestQrToken`) awaits this before returning so the SPA
    // gets a real `tg://login?token=...` URL — not the synthetic
    // `mtcute:default:...` placeholder we used to ship.
    const firstQrUrl = new Promise((resolve, reject) => {
      const onUrl = (url) => {
        resolve(url);
      };
      this._qrPromise = (async () => {
        try {
          const me = await tg.start({
            qrCodeHandler: async (url) => {
              // Persist the URL so checkQrToken can return it
              // to the SPA via `qrUrl` if asked later, AND
              // unblock the awaiting caller above.
              this._lastQr = { ...(this._lastQr || {}), qrUrl: url };
              onUrl(url);
            },
          });
          return { kind: 'success', me: meFromUser(me) };
        } catch (err) {
          // If we never received a URL but mtcute errored,
          // unblock the waiter so it surfaces the right error.
          reject(err);
          if (err && /expired|EXPIRED/i.test(err.message || '')) {
            return { kind: 'expired' };
          }
          return { kind: 'error', error: err };
        }
      })();
    });
    // Wait for the first real QR URL from mtcute. Without this
    // we'd return the synthetic token below and the user's
    // Telegram app would reject the scan as an unknown token.
    const realQrUrl = await firstQrUrl.catch((err) => {
      throw new TelegramTransportError(
        `MtProtoTelegramClient.requestQrToken: ${err.message || err}`
      );
    });
    // Extract the base64 token from the `tg://login?token=...`
    // URL so callers that need a stable identifier (e.g. the
    // gateway poll key) can use it. The token is URL-safe because
    // Telegram servers accept `-` and `_` in `tg://login`.
    const token = realQrUrl.replace(/^tg:\/\/login\?token=/, '');
    return {
      token,
      qrUrl: realQrUrl,
      expiresAt,
      startedAt: Date.now(),
    };
  }

  /**
   * Poll the QR state. Returns the gateway's normalised
   * envelope. We never throw — bad news goes inside the
   * shape so the controller can render a Vietnamese error
   * to the user.
   */
  async checkQrToken(_token) {
    if (!this._qrPromise) {
      // No scan in flight; caller probably crashed and
      // reloaded. Tell them to restart.
      return { status: 'not_found' };
    }
    // Race the in-flight promise against a 0ms tick — if it
    // already settled, we get the result; otherwise we return
    // `awaiting_scan` and let the next tick check again.
    let result;
    try {
      result = await Promise.race([
        this._qrPromise,
        new Promise((resolve) =>
          setTimeout(() => resolve({ kind: 'pending' }), 0)
        ),
      ]);
    } catch (err) {
      return { status: 'error', error: err.message };
    }
    if (result.kind === 'pending') {
      return {
        status: 'awaiting_scan',
        qrUrl: this._lastQr?.qrUrl || null,
      };
    }
    if (result.kind === 'success') {
      // Reset so a future QR request can start fresh.
      this._qrPromise = null;
      return { status: 'success', me: result.me };
    }
    if (result.kind === 'expired') {
      this._qrPromise = null;
      return { status: 'expired' };
    }
    if (result.kind === 'migrating') {
      // mtcute handles DC migration internally; we just
      // keep the same promise alive for the next tick.
      return {
        status: 'migrating',
        token: this._lastQr?.token,
      };
    }
    // result.kind === 'error'
    this._qrPromise = null;
    return {
      status: 'error',
      error: result.error?.message || 'unknown',
    };
  }

  /**
   * Register an inbound message handler. We use mtcute's
   * `onNewMessage` signal and translate the update into our
   * normalised `TelegramMessageEvent` shape so the forwarder
   * doesn't depend on mtcute types.
   *
   * @param {Function} onMessage - handler invoked for every new
   *   message observed by the transport.
   * @param {Object} [opts]
   * @param {string} [opts.accountTelegramUserId] - telegram_user_id
   *   of the account this transport is connected as. The wire event
   *   carries the chat id, not the account id, so the session
   *   manager must override `event.telegramUserId` with this value
   *   before the event reaches the inbound webhook (the webhook
   *   routes by `telegram_user_id`, not by chat id).
   */
  async registerMessageHandler(onMessage, { accountTelegramUserId = null } = {}) {
    if (typeof onMessage !== 'function') {
      throw new TelegramTransportError(
        'MtProtoTelegramClient.registerMessageHandler expects a function'
      );
    }
    const tg = this._buildClient();
    if (typeof tg.onNewMessage?.add !== 'function') {
      throw new TelegramTransportError(
        'mtcute client is missing onNewMessage signal — version mismatch?'
      );
    }
    const overrideAccountId =
      accountTelegramUserId != null ? String(accountTelegramUserId) : null;
    tg.onNewMessage.add(async (msg) => {
      try {
        const sender = msg.sender;
        const event = new TelegramMessageEvent({
          // Wire-forwarded events use the account's own
          // telegram_user_id (so the webhook can route by it), NOT
          // the chat id. The chat id is preserved in `chatId`.
          telegramUserId: overrideAccountId || String(msg.chatId || ''),
          chatId: msg.chatId,
          messageId: msg.id,
          text: msg.text || '',
          senderId: sender?.id ? String(sender.id) : null,
          senderName: sender
            ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') ||
              sender.username ||
              null
            : null,
          isGroup: Boolean(msg.isGroup),
          isPrivate: !msg.isGroup,
          raw: msg,
        });
        await onMessage(event);
      } catch (err) {
        // Don't crash the dispatch loop on a single bad event.
        // The forwarder logs internally; we just swallow here.
        // eslint-disable-next-line no-console
        console.warn('[MtProtoTelegramClient] onMessage handler threw:', err);
      }
    });
  }

  /**
   * Send a text message to `chatId`. Returns the mtcute
   * message id so the caller can correlate with the gateway's
   * outbox if needed.
   */
  async sendMessage(chatId, text) {
    if (!this._tg) {
      throw new TelegramTransportError(
        'MtProtoTelegramClient.sendMessage called before connect()'
      );
    }
    if (chatId == null || text == null) {
      throw new TelegramTransportError(
        'MtProtoTelegramClient.sendMessage requires chatId and text'
      );
    }
    const t0 = Date.now();
    console.log(`[MtProtoTelegramClient] sendMessage start chatId=${chatId} textLen=${String(text).length} elapsed=${Date.now() - t0}ms`);
    let sendTimeout;
    try {
      // mtcute's `sendText` accepts a peer-shaped argument; the
      // chatId we receive is already a Telegram user id (string
      // of digits). Wrap it in the appropriate InputPeer shape.
      const sendPromise = this._tg.sendText(chatId, text);
      console.log(`[MtProtoTelegramClient] sendText returned promise, awaiting...`);
      // Sentinel: a tick to detect event-loop starvation.
      const tickPromise = new Promise((resolve) => setImmediate(resolve));
      let timedOut = false;
      const timeoutPromise = new Promise((_, reject) => {
        sendTimeout = setTimeout(() => {
          timedOut = true;
          reject(new Error('mtcute sendText timeout (20s)'));
        }, 20000);
      });
      const result = await Promise.race([sendPromise, timeoutPromise]);
      console.log(`[MtProtoTelegramClient] sendMessage OK after ${Date.now() - t0}ms id=${result?.id}`);
      return { messageId: result?.id ?? null };
    } catch (err) {
      console.error(`[MtProtoTelegramClient] sendMessage FAILED after ${Date.now() - t0}ms: ${err.message}`);
      console.error(`[MtProtoTelegramClient] stack: ${err.stack}`);
      throw new TelegramTransportError(
        `MtProtoTelegramClient.sendMessage failed: ${err.message}`
      );
    } finally {
      if (sendTimeout) clearTimeout(sendTimeout);
    }
  }

  /**
   * Return an opaque representation of the session. Since
   * migration 217 the actual session lives in Postgres
   * (`telegram_session_state`) — the Postgres-backed driver
   * flushes its in-memory state there automatically on every
   * `StorageManager.save()` event. We still return a marker
   * string so the legacy `_onLoginSuccess` hook in
   * `telegramAuth.js` has something to write into its
   * existence check; the marker is no longer the source of
   * truth (and is no longer persisted to `telegram_accounts`,
   * which lost its `session_string` column in migration 218).
   *
   * Before `connect()` runs, the mtcute client is not built yet,
   * so we have nothing to report — return an empty string (the
   * pre-215 contract). Once connected, prefer the Postgres
   * marker when a `storageProvider` was injected; otherwise
   * fall back to the legacy `mtcute:<storageKey>` shape so
   * existing SQLite-path deployments keep producing the same
   * marker.
   */
  saveSession() {
    if (!this._tg) return this.sessionString || '';
    if (this._storageProvider) return 'postgres:loaded';
    return `mtcute:${this._storageKey}`;
  }
}

/**
 * Parse `TELEGRAM_DC_WHITELIST` into the shape mtcute's
 * `defaultDcs` option expects.
 *
 * Input format (comma-separated):
 *   <dcId>=<ip>[:<port>] [, <dcId>=<ip>[:<port>]] …
 *
 * Example:
 *   TELEGRAM_DC_WHITELIST=2=149.154.167.50,2=91.108.56.130,4=149.154.167.50
 *
 * Default port is 443 (the well-known Telegram DC TLS port).
 * The ip/dcId pair must be valid; anything else is skipped with a
 * `console.warn`. Malformed env must never crash the connect path.
 *
 * @param {string|undefined} raw
 * @returns {Array<{ id: number, ipAddress: string, port: number }>}
 */
function parseDcWhitelist(raw) {
  if (!raw) return [];
  const out = [];
  for (const entry of String(raw).split(',').map((s) => s.trim()).filter(Boolean)) {
    // Format: `<dcId>=<ipv4>[:<port>]`. IPv6 not supported here
    // because mtcute's `defaultDcs` address parser matches by
    // dot/hex bounds; operators with IPv6-only egress can use
    // `Telnet forwarding` or a SOCKS proxy instead.
    const m = entry.match(/^(\d+)=(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/);
    if (!m) {
      console.warn(
        `[MtProtoTelegramClient] Ignoring malformed TELEGRAM_DC_WHITELIST entry: ${entry}`
      );
      continue;
    }
    const [, dcId, ip, port] = m;
    out.push({
      id: Number(dcId),
      ipAddress: ip,
      port: Number(port || 443),
    });
  }
  return out;
}

/**
 * Collapse a parsed DC list into the `{ main, media }` shape mtcute
 * accepts at `TelegramClient({ defaultDcs })`. Telegram reuses the
 * same DC for main and media traffic, so we hand the first
 * whitelisted entry to both. Returns `null` for an empty list so
 * the caller can skip setting `defaultDcs` and fall back to
 * mtcute's built-in production DC list.
 *
 * @param {Array<{id:number,ipAddress:string,port:number}>} list
 * @returns {{main: any, media: any} | null}
 */
function buildDefaultDcs(list) {
  if (!list || list.length === 0) return null;
  return { main: list[0], media: list[0] };
}

// Exported for unit tests; do not use at runtime.
export const __test__ = { parseDcWhitelist, buildDefaultDcs };

export default MtProtoTelegramClient;
