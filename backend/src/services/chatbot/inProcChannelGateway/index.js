/**
 * inProcChannelGateway/index.js
 *
 * Single bootstrap entry point that wires the in-process Telegram
 * channel gateway into the rest of the Node backend. Replaces the
 * `telegramGatewayProcess.manager.js` file that used to spawn a
 * Python subprocess.
 *
 * Public surface:
 *   - ensureGateway()      — lazy initialise. No-op for in-process mode
 *                            but kept for symmetry with the old API.
 *   - getState()           — readiness snapshot for /health endpoints.
 *   - shutdownGateway()    — clean tear-down on SIGTERM/SIGINT.
 *   - getChannelGateway()  — return the facade for the `telegram`
 *                            channel. Facade exposes exactly the
 *                            same methods the old
 *                            `telegramGateway.client` did, so
 *                            controllers and adapters don't need to
 *                            change.
 *   - getSecret(channel)   — return the per-channel shared secret.
 *   - getNodeJsCallbackUrl(channel)
 *   - isStubOnly({ channel }) — return true when no real transport
 *                            was plugged in via the env var. Used
 *                            by the controller to surface a clear
 *                            "transport not implemented" hint and
 *                            by the boot hook to print a prominent
 *                            warning at startup.
 *
 * Why a single module instead of N separate `*Process.manager.js`?
 *   - All channels share the same lifecycle: start, stop, signal hooks.
 *   - The shared secret mechanism is identical across channels;
 *     only the persisted path differs.
 *   - Easier to add new channels (Facebook personal, Zalo personal,
 *     etc.) by dropping a new file under this directory.
 */

import { getTelegramInboxForwarder } from './inboxForwarder.js';
import { getTelegramAuth } from './telegramAuth.js';
import { getTelegramSessionManager } from './telegramSessionManager.js';
import chatbotTelegramRepository from '../../../repositories/chatbot/chatbotTelegram.repository.js';

// Re-export stub helpers from the leaf module so callers don't have
// to know about the split. The helpers themselves live in a
// dependency-free file to avoid the circular import that arises when
// the auth module tries to import from index.js.
import { isStubOnly as _isStubOnly } from './stubCheck.js';
export const isStubOnly = _isStubOnly;

const logInfo = (msg, meta) =>
  meta !== undefined ? console.log(msg, meta) : console.log(msg);
const logWarn = (msg) => console.warn(msg);

// ── Per-channel state ────────────────────────────────────────────────

function makeChannelState({ channel, authCtor, sessionManagerCtor, repo, forwarderFactory, facadeMaker }) {
  const state = {
    channel,
    secret: '',
    nodeJsCallbackUrl: '',
    started: false,
    auth: null,
    sessionManager: null,
    inboxForwarder: null,
    repo,
    facade: null,
  };

  // Telegram needs (apiId, apiHash) at session-create time. Read
  // them from env here so the auth singleton can hand them to the
  // transport layer.
  const apiIdRaw = process.env.TELEGRAM_API_ID;
  const apiHashRaw = process.env.TELEGRAM_API_HASH;
  const apiId = apiIdRaw ? Number.parseInt(apiIdRaw, 10) : null;
  const apiHash = apiHashRaw && apiHashRaw.length > 0 ? apiHashRaw : null;
  state.auth = authCtor(repo, { apiId, apiHash });
  // Build the forwarder BEFORE the session manager so the manager
  // can subscribe restored clients to inbound events immediately
  // after `isAuthorized()` succeeds.
  state.inboxForwarder = forwarderFactory({
    getSecret: () => state.secret,
    getNodeJsCallbackUrl: () => state.nodeJsCallbackUrl,
  });
  state.sessionManager = sessionManagerCtor(
    repo,
    { apiId, apiHash },
    state.inboxForwarder
  );
  state.facade = facadeMaker(state);

  return state;
}

const channels = {
  telegram: null,
};

function getChannel(channel) {
  if (!channels[channel]) {
    if (channel === 'telegram') {
      channels.telegram = makeChannelState({
        channel: 'telegram',
        authCtor: getTelegramAuth,
        sessionManagerCtor: getTelegramSessionManager,
        repo: chatbotTelegramRepository,
        forwarderFactory: getTelegramInboxForwarder,
        facadeMaker: makeTelegramFacade,
      });
    } else {
      throw new Error(`[inProcChannelGateway] unknown channel: ${channel}`);
    }
  }
  return channels[channel];
}

// ── Lifecycle ────────────────────────────────────────────────────────

let lifecycleInstalled = false;

function computeNodeCallbackUrl() {
  const explicit = process.env.NODEJS_INTERNAL_URL;
  if (explicit) return `${explicit.replace(/\/+$/, '')}/api/internal`;
  const port = process.env.PORT || '5001';
  return `http://127.0.0.1:${port}/api/internal`;
}

export async function ensureGateway({ channel = null } = {}) {
  // Touch the channel's state — this is a no-op for stub transports
  // but reserves the wiring so a real transport can be plugged in
  // without changing call sites.
  const list = channel ? [channel] : Object.keys(channels);
  for (const ch of list) {
    const s = getChannel(ch);
    if (!s.started) {
      s.sessionManager.start();
      s.started = true;
      logInfo(`[inProcChannelGateway:${ch}] started`);
      // Eagerly restore persisted sessions so inbound messages
      // are received for every active account — not only for the
      // one that just sent something.
      try {
        await s.sessionManager.restoreSessionsFromDb();
      } catch (err) {
        logWarn(
          `[inProcChannelGateway:${ch}] restoreSessionsFromDb failed: ${err.message}`
        );
      }
    }
  }
  return { ok: true, channels: list };
}

export function getState() {
  const out = {};
  for (const [name, s] of Object.entries(channels)) {
    if (!s) continue;
    out[name] = {
      started: s.started,
      hasSecret: Boolean(s.secret),
      activeClients: s.sessionManager.listActiveClients?.() || [],
      // `stubOnly=true` means no real transport is plugged in for
      // this channel — operators see this in /health and know
      // QR login will return 503 until they set the env var.
      stubOnly: isStubOnly({ channel: name }),
    };
  }
  return out;
}

export async function shutdownGateway() {
  for (const s of Object.values(channels)) {
    if (!s) continue;
    try {
      await s.sessionManager.stop();
    } catch (err) {
      logWarn(`[inProcChannelGateway:${s.channel}] stop failed: ${err.message}`);
    }
  }
  for (const k of Object.keys(channels)) channels[k] = null;
}

export function installLifecycleHooks() {
  if (lifecycleInstalled) return;
  lifecycleInstalled = true;
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => {
      shutdownGateway().catch(() => {});
    });
  }
  process.on('exit', () => {
    shutdownGateway().catch(() => {});
  });
}

// ── Facade exposed to controllers/adapters ───────────────────────────

/**
 * Telegram-shape facade. Snake-cased keys mirror the Python gateway's
 * wire format so `telegramPersonal.service.js` and
 * `telegram.adapter.js` don't have to change.
 */
function makeTelegramFacade(state) {
  const { repo, sessionManager, auth } = state;

  return {
    channel: 'telegram',
    isConfigured: () => Boolean(state.secret),
    get baseUrl() { return 'in-process'; },
    setSharedSecret(secret, callbackUrl) {
      // `undefined` is a no-op so callers can pass a config object
      // without clobbering existing state. `null` or empty string
      // explicitly clears the secret (used in tests).
      if (secret !== undefined) state.secret = secret || '';
      if (callbackUrl !== undefined) state.nodeJsCallbackUrl = callbackUrl;
    },
    getSecret: () => state.secret,
    getNodeJsCallbackUrl: () => state.nodeJsCallbackUrl,

    createSession: async (userId = null) => {
      // User ownership is propagated through the gateway so that
      // `TelegramAuth._onLoginSuccess` can stamp the correct
      // `id_user` on the new `telegram_accounts` row. Without it,
      // the INSERT hits the NOT NULL constraint on `id_user` for
      // a fresh Telegram user_id and the operator sees:
      //   "Failed to persist session: null value in column
      //    \"id_user\" of relation \"telegram_accounts\"
      //    violates not-null constraint"
      const r = await auth.start({ userId });
      return {
        session_id: r.sessionId,
        qr_url: r.qrUrl,
        qr_image_base64: r.qrImageBase64,
        expires_at: r.expiresAt,
      };
    },
    getStatus: (sessionId) => auth.getStatus(sessionId),
    cancelSession: (sessionId) => auth.cancel(sessionId),

    listAccounts: async () => {
      const rows = await repo.listAllSessions();
      const loaded = new Set(sessionManager.listActiveClients());
      return rows.map((row) => ({
        telegram_user_id: Number(row.telegram_user_id),
        account_id: row.id,
        phone: row.phone,
        first_name: row.first_name,
        last_name: row.last_name,
        username: row.username,
        is_loaded: loaded.has(String(row.telegram_user_id)),
      }));
    },

    deleteAccount: async (telegramUserId) => {
      const ok = await sessionManager.disconnect(String(telegramUserId));
      await repo.deleteByTelegramUserId(Number(telegramUserId));
      return { deleted: Boolean(ok) };
    },

    bindAccount: async (telegramUserId, accountId) =>
      repo.bindAccount(Number(telegramUserId), Number(accountId)),

    sendMessage: (telegramUserId, chatId, text) =>
      sessionManager.sendMessage(
        Number(telegramUserId),
        Number(chatId),
        String(text)
      ),

    ensureHandler: async () => ({ data: { ok: true } }),
  };
}

export function getChannelGateway(channel) {
  return getChannel(channel).facade;
}

export function getSecret(channel) {
  return getChannel(channel).secret;
}

export function getNodeJsCallbackUrl(channel) {
  return getChannel(channel).nodeJsCallbackUrl;
}

/**
 * Configure the per-channel shared secret + callback URL. Called from
 * the application bootstrap (right after `installLifecycleHooks()` and
 * before any controller can hit the gateway). Symmetric mode: the same
 * secret is used for both directions, mirroring the old embedded mode.
 */
export function configureChannel(channel, { secret, callbackUrl } = {}) {
  const s = getChannel(channel);
  // `secret === undefined` is a no-op (used by callers that pass a
  // partial config). Empty string / null explicitly clears.
  if (secret !== undefined) s.secret = secret || '';
  s.nodeJsCallbackUrl =
    callbackUrl !== undefined ? callbackUrl : computeNodeCallbackUrl();
  return s;
}

/**
 * Test-only: clear all state. Production code should never call this.
 */
export function _resetForTests() {
  for (const k of Object.keys(channels)) channels[k] = null;
  lifecycleInstalled = false;
}

// Auto-configure callback URLs at import time so the webhook route
// can authenticate even if the app bootstrap forgot to call
// configureChannel(). Mirrors the old telegramGateway.client.js
// behaviour. We also pull the shared secret from process.env if
// present so the gateway is "configured" out of the box. App-level
// callers can still override via `configureChannel({ secret })`.
installLifecycleHooks();
const fallback = computeNodeCallbackUrl();
if (!channels.telegram) getChannel('telegram');
configureChannel('telegram', {
  secret: process.env.TELEGRAM_GATEWAY_SECRET,
  callbackUrl: fallback,
});

// Boot-time diagnostic: if every channel is running on its stub
// transport, QR login will 503 for the rest of the process lifetime.
// Surface a single prominent warning so the operator doesn't have to
// hit the UI to discover the misconfiguration.
import { warnOnce as _warnOnce } from './warnOnce.js';
for (const ch of ['telegram']) {
  if (isStubOnly({ channel: ch })) {
    _warnOnce(
      `boot:stub-only:${ch}`,
      `\n[inProcChannelGateway] ⚠️  ${ch.toUpperCase()} is running on STUB transport.\n` +
        `    QR login endpoints will return 503 until you set TELEGRAM_GATEWAY_TRANSPORT\n` +
        `    to a real transport class (path or URL).\n`
    );
  }
}

export default {
  ensureGateway,
  getState,
  shutdownGateway,
  installLifecycleHooks,
  getChannelGateway,
  getSecret,
  getNodeJsCallbackUrl,
  configureChannel,
  isStubOnly,
};
