/**
 * telegramAuth.js
 *
 * In-process replacement for `telegram-gateway/app/auth.py`. Coordinates
 * QR login attempts from the chatbot frontend: builds a fresh
 * `TelegramClient`, requests a QR token, renders the QR as a base64
 * PNG, and polls the transport in the background until the user scans
 * or the token expires. On success the resulting session is persisted
 * to the `telegram_accounts` table.
 *
 * The transport is intentionally a stub today — see telegramClient.js.
 * Swap `buildDefaultClient` for a real Telethon-compatible transport
 * and the rest of the flow comes up automatically. Until then,
 * `start()` will throw a `TelegramTransportError` which the controller
 * maps to a 503 response.
 */

import crypto from 'node:crypto';
import QRCode from 'qrcode';

import { TelegramTransportError, buildDefaultClient, whenReady } from './telegramClient.js';
import { warnOnce } from './warnOnce.js';
import { isStubOnly } from './stubCheck.js';

// Lazy-import InMemoryTelegramStorage / extractSerializedState để tránh
// pull `@mtcute/core` ở module top-level. Trong stub mode (test isStubOnly)
// `MtProtoTelegramClient` không load được nên @mtcute/core throw về
// native binding `long` — top-level import sẽ làm crash cả import chain.
// `telegramSessionManager` đã làm pattern này (loadMtProtoStorageModule
// cached) — áp dụng tương tự cho QR login path.
let _mtProtoStorageModule = null;
async function loadMtProtoStorageModule() {
  if (_mtProtoStorageModule) return _mtProtoStorageModule;
  _mtProtoStorageModule = await import('./telegramMtProtoStorage.js');
  return _mtProtoStorageModule;
}

const logInfo = (msg, meta) =>
  meta !== undefined ? console.log(msg, meta) : console.log(msg);
const logWarn = (msg) => console.warn(msg);

const POLL_INTERVAL_MS = 3_000;
const TOKEN_TTL_MS = 30_000; // Telegram QR tokens live for ~30s
// How long a terminal (SUCCESS / EXPIRED / ERROR / MIGRATING) flow is
// kept in memory so the SPA's final /status poll can still read it.
const TERMINAL_FLOW_TTL_MS = 60_000;

// Public status string constants. Kept identical to the Python gateway
// so any cross-stack debugging tool can grep for them.
export const QR_STATUS = Object.freeze({
  AWAITING_SCAN: 'awaiting_scan',
  MIGRATING: 'migrating',
  SUCCESS: 'success',
  EXPIRED: 'expired',
  ERROR: 'error',
  NOT_FOUND: 'not_found',
});

/**
 * One in-flight QR login attempt. Mirrors the `QrLoginSession`
 * dataclass from the Python gateway.
 */
class QrLoginSession {
  constructor({ sessionId, client, token, qrUrl, expiresAt }) {
    this.sessionId = sessionId;
    this.client = client;
    this.token = token;
    this.qrUrl = qrUrl;
    this.expiresAt = expiresAt;
    this.userId = null;
    this.me = null;
    this.accountId = null;
    this.status = QR_STATUS.AWAITING_SCAN;
    this.error = null;
    this.pollHandle = null;
    this.endedAt = null;
  }

  isTerminal() {
    return (
      this.status === QR_STATUS.SUCCESS ||
      this.status === QR_STATUS.EXPIRED ||
      this.status === QR_STATUS.ERROR
    );
  }
}

/**
 * Coordinates QR login attempts across concurrent users.
 */
export class TelegramAuth {
  /**
   * @param {Object} deps
   * @param {Object} deps.sessionRepo - Anything that can persist a
   *   freshly logged-in session. Must implement:
   *     upsertSession({ telegramUserId, sessionString, phone, firstName, lastName, username })
   *   The default `chatbotTelegramRepository.upsertSession` works out
   *   of the box.
   * @param {Object} [deps.telegramCreds]
   * @param {number} [deps.telegramCreds.apiId]
   * @param {string} [deps.telegramCreds.apiHash]
   */
  constructor({ sessionRepo, telegramCreds = {} } = {}) {
    if (!sessionRepo) {
      throw new Error(
        '[TelegramAuth] sessionRepo is required — pass chatbotTelegramRepository (or compatible).'
      );
    }
    this._flows = new Map();
    this._sessionRepo = sessionRepo;
    this._telegramCreds = telegramCreds;
  }

  /**
   * Start a new QR login flow. Returns the QR + session_id for polling.
   * On stub transport this throws `TelegramTransportError` so the
   * controller can return 503.
   */
  async start({ userId } = {}) {
    console.log('[TelegramAuth] start() called, userId=', userId);
    // Defense-in-depth: short-circuit on stub transports with a
    // stable, code-tagged error. Controllers also check this, but
    // direct callers (tests, future services) should not have to
    // duplicate the same env-read.
    if (isStubOnly({ channel: 'telegram' })) {
      const err = new TelegramTransportError(
        'Telegram transport is not implemented on this server. ' +
          'Set TELEGRAM_GATEWAY_TRANSPORT to a real client class.'
      );
      err.code = 'TELEGRAM_STUB_TRANSPORT';
      err.status = 503;
      throw err;
    }
    // Wait for the production client class to finish its async
    // module import. The resolver races against `buildDefaultClient`
    // at startup; awaiting here guarantees we hand the controller
    // the real class on the very first request, not a stub that
    // would 503 the user.
    await whenReady();
    // Surface a clear, operator-friendly error early if the env
    // vars were never populated. The underlying transport would
    // throw the same message, but from inside mtcute — this
    // gives the API caller a hint pointing at the right env var.
    if (!this._telegramCreds.apiId || !this._telegramCreds.apiHash) {
      const err = new TelegramTransportError(
        'Telegram credentials are missing. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in the backend .env before starting a QR login.'
      );
      err.code = 'TELEGRAM_MISSING_CREDENTIALS';
      err.status = 503;
      throw err;
    }
    // QR login flow không biết telegramUserId trước khi user scan → không
    // thể tạo PostgresBackedTelegramStorage. Dùng InMemoryTelegramStorage
    // để mtcute KHÔNG rơi về file SQLite (gây EACCES / mkdir / user đã
    // yêu cầu nhiều lần "không lưu session vào file ở folder").
    // Sau khi login success, _onLoginSuccess gọi extractSerializedState +
    // sessionRepo.saveSessionState để flush state vào DB với telegramUserId
    // thật. telegramSessionManager sẽ tạo PostgresBackedTelegramStorage
    // mới cho runtime.
    //
    // Lazy import qua loadMtProtoStorageModule() để không pull @mtcute/core
    // ở module top-level (xem comment import phía trên).
    const { InMemoryTelegramStorage } = await loadMtProtoStorageModule();
    const client = buildDefaultClient({
      apiId: this._telegramCreds.apiId,
      apiHash: this._telegramCreds.apiHash,
      storageProvider: new InMemoryTelegramStorage(),
    });
    console.log('[TelegramAuth] calling client.connect() — may take a while if outbound to Telegram DC is slow/blocked');
    const connectStart = Date.now();
    // Race the underlying mtcute TCP handshake against a wall-clock
    // cap. Without this, a blocked outbound (firewall, missing
    // international routing, etc.) would hang the whole QR init
    // request for the full axios 60s while mtcute retries its
    // internal backoff loop. Operator can tune via
    // `TELEGRAM_CONNECT_TIMEOUT_MS` (default 15s).
    const connectTimeoutMs = Number(
      process.env.TELEGRAM_CONNECT_TIMEOUT_MS || 15000
    );
    let connectTimer;
    const timeoutPromise = new Promise((_, reject) => {
      connectTimer = setTimeout(() => {
        const err = new TelegramTransportError(
          `Telegram client.connect timed out after ${connectTimeoutMs}ms — ` +
            'the backend cannot reach Telegram DCs. Check firewall / ' +
            'network egress and TELEGRAM_API_ID/TELEGRAM_API_HASH.'
        );
        err.code = 'TELEGRAM_CONNECT_TIMEOUT';
        err.status = 504;
        reject(err);
      }, connectTimeoutMs);
    });
    try {
      await Promise.race([client.connect(), timeoutPromise]);
    } catch (err) {
      console.error(`[TelegramAuth] client.connect failed/aborted after ${Date.now() - connectStart}ms:`, err.message);
      throw err;
    } finally {
      clearTimeout(connectTimer);
    }
    console.log(`[TelegramAuth] client.connect() resolved in ${Date.now() - connectStart}ms`);

    let tokenInfo;
    // requestQrToken thực sự dial TCP tới Telegram DC qua WARP proxy
    // (hoặc direct) và await QR token URL từ mtcute. Nếu egress bị
    // chặn, promise này treo cho đến khi axios client timeout 60s —
    // trải nghiệm rất tệ. Bọc nó với cùng timeout cap đã dùng ở
    // connect() để fail-fast với TELEGRAM_CONNECT_TIMEOUT thay vì
    // treo cả request HTTP.
    const qrTimeoutMs = Number(
      process.env.TELEGRAM_CONNECT_TIMEOUT_MS || 15000
    );
    let qrTimer;
    const qrTimeoutPromise = new Promise((_, reject) => {
      qrTimer = setTimeout(() => {
        const err = new TelegramTransportError(
          `Telegram requestQrToken timed out after ${qrTimeoutMs}ms — ` +
            'the backend cannot complete the MTProto handshake with Telegram DCs. ' +
            'Verify TELEGRAM_PROXY_URL (e.g. WARP) is connected and reachable, ' +
            'and TELEGRAM_DC_WHITELIST is NOT pinning IP addresses that ' +
            'cannot route through the proxy.'
        );
        err.code = 'TELEGRAM_CONNECT_TIMEOUT';
        err.status = 504;
        reject(err);
      }, qrTimeoutMs);
    });
    try {
      try {
        tokenInfo = await Promise.race([
          client.requestQrToken(),
          qrTimeoutPromise,
        ]);
      } finally {
        clearTimeout(qrTimer);
      }
    } catch (err) {
      // Cleanup client ngay khi timeout / fail — mtcute giữ promise
      // nội bộ đang pending, nếu không destroy thì session storage
      // sẽ bị khoá và lần QR sau treo ngay từ buildClient().
      await safeDisconnect(client);
      throw err;
    }

    const token = tokenInfo?.token || tokenInfo?.token_b64;
    const qrUrl = tokenInfo?.qrUrl || tokenInfo?.qr_url || (token ? `tg://login?token=${token}` : null);
    if (!token || !qrUrl) {
      await safeDisconnect(client);
      throw new TelegramTransportError(
        'Telegram transport returned no token/qrUrl — cannot render QR.'
      );
    }

    let qrImageBase64;
    try {
      qrImageBase64 = await QRCode.toDataURL(qrUrl, { margin: 1, width: 256 });
      const idx = qrImageBase64.indexOf(',');
      if (idx >= 0) qrImageBase64 = qrImageBase64.slice(idx + 1);
    } catch (err) {
      await safeDisconnect(client);
      throw new TelegramTransportError(`Failed to render QR: ${err.message}`);
    }

    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const sessionId = crypto.randomBytes(16).toString('hex');

    const flow = new QrLoginSession({
      sessionId,
      client,
      token,
      qrUrl,
      expiresAt,
    });
    flow.userContext = userId ?? null;
    this._flows.set(sessionId, flow);

    flow.pollHandle = setInterval(() => {
      this._pollOnce(flow).catch((err) => {
        // Poll-loop crashes are rare but should never go unnoticed.
        // warnOnce ensures the first crash logs and subsequent ones
        // are silent — a tight loop here would otherwise flood logs.
        warnOnce(
          `telegram-auth:poll-crash:${flow.sessionId}:${err.message}`,
          `[TelegramAuth] poll loop crashed: ${err.message}`
        );
      });
    }, POLL_INTERVAL_MS);

    return {
      sessionId,
      qrUrl,
      qrImageBase64,
      expiresAt,
    };
  }

  /**
   * Get the current status of a QR flow. Used by the frontend polling
   * endpoint. Returns snake_case keys to mirror the Python gateway's
   * wire format — `telegramPersonal.service.js` reads
   * `user.telegram_user_id`, `user.first_name`, etc.
   */
  getStatus(sessionId) {
    this._gcExpiredFlows();
    const flow = this._flows.get(sessionId);
    if (!flow) return { status: QR_STATUS.NOT_FOUND };

    const payload = { status: flow.status };
    if (flow.status === QR_STATUS.SUCCESS) {
      payload.account_id = flow.accountId;
      payload.user = flow.me
        ? {
            telegram_user_id: flow.me.telegramUserId,
            first_name: flow.me.firstName,
            last_name: flow.me.lastName,
            username: flow.me.username,
            phone: flow.me.phone,
          }
        : null;
    }
    if (flow.status === QR_STATUS.EXPIRED || flow.status === QR_STATUS.ERROR) {
      payload.error = flow.error || 'QR flow ended';
    }
    return payload;
  }

  /**
   * Cancel an in-flight QR login flow.
   */
  async cancel(sessionId) {
    const flow = this._flows.get(sessionId);
    if (!flow) return false;
    flow.endedAt = Date.now();
    this._cleanup(flow);
    return true;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  async _pollOnce(flow) {
    if (flow.status !== QR_STATUS.AWAITING_SCAN && flow.status !== QR_STATUS.MIGRATING) {
      this._cleanup(flow);
      return;
    }
    if (Date.now() >= flow.expiresAt) {
      flow.status = QR_STATUS.EXPIRED;
      flow.error = 'QR token expired before scan';
      flow.endedAt = Date.now();
      this._cleanup(flow);
      return;
    }

    let result;
    try {
      result = await flow.client.checkQrToken(flow.token);
    } catch (err) {
      if (err && /invalid|expired/i.test(err.message || '')) {
        flow.status = QR_STATUS.EXPIRED;
        flow.error = err.message;
        flow.endedAt = Date.now();
        this._cleanup(flow);
        return;
      }
      warnOnce(
        `telegram-auth:check-err:${flow.sessionId}:${err.message}`,
        `[TelegramAuth] checkQrToken error: ${err.message}`
      );
      return;
    }

    if (!result || result.status === 'pending') return;

    if (result.status === 'migrating' && result.token) {
      flow.token = result.token;
      flow.expiresAt = Date.now() + TOKEN_TTL_MS;
      flow.status = QR_STATUS.MIGRATING;
      return;
    }

    if (result.status === 'success' && result.me) {
      await this._onLoginSuccess(flow, result.me);
      flow.endedAt = Date.now();
      this._cleanup(flow);
    } else if (result.status === 'expired') {
      flow.status = QR_STATUS.EXPIRED;
      flow.error = result.error || 'Token expired';
      flow.endedAt = Date.now();
      this._cleanup(flow);
    }
  }

  async _onLoginSuccess(flow, me) {
    const telegramUserId = Number(
      me?.telegramUserId || me?.telegram_user_id || me?.id || me?.userId || 0
    );
    if (!telegramUserId) {
      flow.status = QR_STATUS.ERROR;
      flow.error = 'Login succeeded but transport gave no user id';
      flow.endedAt = Date.now();
      return;
    }

    flow.userId = telegramUserId;
    flow.me = {
      telegramUserId,
      firstName: me.firstName || me.first_name || null,
      lastName: me.lastName || me.last_name || null,
      username: me.username || null,
      phone: me.phone || null,
    };

    // Flush in-memory state → Postgres (atomic).
    //
    // QR login dùng `InMemoryTelegramStorage` vì ta chưa biết
    // telegram_user_id lúc start(). State chỉ tồn tại trong RAM của
    // tiến trình — bắt buộc phải flush ngay khi scan xong, không chờ
    // disconnect (backend có thể restart trước khi user logout).
    //
    // Bug trước: code saveSessionState riêng → FK violation vì
    // telegram_session_state có FK refer telegram_accounts và
    // telegram_accounts row chưa được insert. Fix: gọi upsertSession
    // MỘT LẦN với cả profile payload + sessionState blob. Repo đã
    // được sửa để thực hiện UPSERT profile trước, sau đó UPSERT state
    // row trong cùng call (xem chatbotTelegram.repository.upsertSession).
    try {
      // Lazy import để không pull @mtcute/core ở top-level (xem comment
      // ở đầu file). Sau login thành công là path warm-cache nên import
      // lần thứ 2 sẽ gần như free.
      const { extractSerializedState } = await loadMtProtoStorageModule();
      const memoryStorage = flow.client?._storageProvider;
      const blob = memoryStorage
        ? extractSerializedState(memoryStorage)
        : null;

      // Build payload. `session` — blob là data từ InMemoryTelegramStorage.
      // Nếu blob null (vd caller dùng PostgresBacked driver đã auto-save),
      // ta vẫn cần insert profile row với marker tối thiểu để FK không
      // dangling. Dùng object rỗng {} để repo upsert state row với data
      // rỗng — không lý tưởng nhưng tránh crash. Trong thực tế QR login
      // path luôn có blob (vì storageProvider là InMemoryTelegramStorage).
      await this._sessionRepo.upsertSession({
        telegramUserId,
        // The requesting workspace owner (`userId` from
        // controller's `req.user`) is the foreign key we need
        // for telegram_accounts.id_user. Without it the INSERT
        // violates the NOT NULL constraint and the operator
        // sees "Failed to persist session: null value in
        // column \"id_user\" of relation \"telegram_accounts\"
        // violates not-null constraint".
        userId: flow.userContext ?? null,
        sessionState: blob ?? {},
        phone: flow.me.phone,
        firstName: flow.me.firstName,
        lastName: flow.me.lastName,
        username: flow.me.username,
      });
    } catch (err) {
      flow.status = QR_STATUS.ERROR;
      flow.error = `Failed to persist session: ${err.message}`;
      flow.endedAt = Date.now();
      logWarn(
        `[TelegramAuth] persist failed for telegram_user_id=${telegramUserId}: ${err.message}`
      );
      return;
    }

    flow.status = QR_STATUS.SUCCESS;
    flow.endedAt = Date.now();
    logInfo(`[TelegramAuth] login success for telegram_user_id=${telegramUserId}`);
  }

  _cleanup(flow) {
    if (flow.pollHandle) {
      clearInterval(flow.pollHandle);
      flow.pollHandle = null;
    }
    if (flow.client) {
      safeDisconnect(flow.client).catch(() => {});
    }
  }

  /**
   * Sweep terminal flows whose `endedAt + TERMINAL_FLOW_TTL_MS` has
   * passed. Runs opportunistically on `getStatus`. Returns the count
   * of flows evicted.
   */
  _gcExpiredFlows() {
    const now = Date.now();
    let evicted = 0;
    for (const [sessionId, flow] of this._flows.entries()) {
      if (
        flow.endedAt !== null &&
        now - flow.endedAt >= TERMINAL_FLOW_TTL_MS
      ) {
        this._flows.delete(sessionId);
        evicted += 1;
      }
    }
    return evicted;
  }
}

async function safeDisconnect(client) {
  try {
    await client.disconnect();
  } catch {
    // best-effort
  }
}

/**
 * Singleton wired with the default repository. Lazy-initialised so
 * importing this module does not require DB connection at boot.
 */
let _singleton = null;

export function getTelegramAuth(sessionRepo, telegramCreds) {
  if (!_singleton) {
    _singleton = new TelegramAuth({ sessionRepo, telegramCreds });
  }
  return _singleton;
}

/**
 * Test-only: reset the singleton so a fresh `sessionRepo` can be
 * injected. Production code should never call this.
 */
export function _resetTelegramAuth() {
  _singleton = null;
}

export default { TelegramAuth, getTelegramAuth, QR_STATUS };
