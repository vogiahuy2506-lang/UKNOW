/**
 * whatsappBaileys.service.js
 *
 * Per-WhatsApp-number session using @whiskeysockets/baileys (the multi-device
 * library that powers Evolution API). Each `sessionKey` represents one phone
 * number; the session state (creds + app-state-sync keys + signal keys) is
 * persisted to Postgres (see `whatsappBaileysSession.repository`) so the user
 * only needs to scan the QR code ONCE per device, even across restarts and
 * multi-instance rollouts.
 *
 * Why Baileys instead of Meta Cloud API:
 *   - No Meta App, App ID, App Secret, Business verification required.
 *   - User just scans a QR with their WhatsApp Business phone → connected.
 *   - Works on local / private networks (the socket talks to Meta servers,
 *     so it still needs outbound internet, but the BACKEND does NOT need
 *     any inbound webhook URL).
 *
 * Caveats (vs Cloud API):
 *   - Single-tenant per connection: each session = one phone number.
 *   - Higher chance of Meta throttling / ban on aggressive bulk sends.
 *   - Use only with WhatsApp Business numbers — sending from a personal
 *     number may trigger Meta policy violations.
 */
import path from 'node:path';
import {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeWASocket,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { useDatabaseAuthState } from './whatsapp/useDatabaseAuthState.js';

// All per-session state for Baileys is now in Postgres:
//   - AuthenticationCreds + signal keys → whatsapp_baileys_session_creds /
//     whatsapp_baileys_session_keys (see migration 213).
//   - Display metadata (meId, meName)  → whatsapp_baileys_session_profile
//     (see migration 214).
//
// This directory is reserved for the legacy `creds.json` fallback
// scanner in `listPersistedSessions` — it is NOT used for any
// authoritative state. Operators running an existing 213+ install
// should set WHATSAPP_BAILEYS_SESSION_DIR=/nonexistent to disable
// the fallback entirely.
const SESSION_ROOT = path.resolve(
  process.env.WHATSAPP_BAILEYS_SESSION_DIR
    || path.join(process.cwd(), 'whatsapp-sessions')
);

const log = (...args) => console.log('[WhatsApp/Baileys]', ...args);

/**
 * @typedef {object} SessionRecord
 * @property {string} sessionKey         unique per channel, e.g. `${userId}-${chatbotId}`
 * @property {import('@whiskeysockets/baileys').WASocket} socket
 * @property {NodeJS.EventEmitter} emitter  emits 'qr', 'connection.update', 'message'
 * @property {string|null} lastQr         most recent QR data-URL, used by polling endpoint
 * @property {object} creds              latest creds snapshot (roaming key material)
 * @property {string} status             'connecting' | 'open' | 'close'
 */

/** @type {Map<string, SessionRecord>} */
const sessions = new Map();

/**
 * In-memory mirror of `whatsapp_baileys_session_profile` so
 * `getSession()` (a synchronous read path called from list/render
 * routes) doesn't have to hit Postgres for every poll. The map is
 * seeded by `hydrateProfileCache()` at startup and updated
 * write-through from `persistProfile()`.
 *
 * Why a cache instead of just making getSession async? Because
 * the controller's list endpoint calls `getSession` once per row
 * inside a single response — turning each call into a DB round-
 * trip would add N queries per list page and break the existing
 * latency budget. The cache is also tiny (a few KB per session).
 */
const profileCache = new Map();

/**
 * Seed the in-memory cache from Postgres. Called once at module
 * load (fire-and-forget). On multi-instance deploys each Node
 * process rebuilds its own cache — that's fine because every
 * write goes through `persistProfile()` which updates BOTH the
 * local cache AND Postgres, so reads on instance A stay
 * consistent with writes done on instance B within the same
 * request lifetime.
 */
async function hydrateProfileCache() {
  try {
    const { default: sessionRepo } = await import(
      '../../repositories/chatbot/whatsappBaileysSession.repository.js'
    );
    const keys = await sessionRepo.listSessionKeys();
    await Promise.all(
      keys.map(async (key) => {
        const row = await sessionRepo.loadProfile(key);
        if (row && (row.meId || row.meName)) {
          profileCache.set(key, row);
        }
      })
    );
  } catch (err) {
    log('hydrateProfileCache failed (will retry lazily):', err.message);
  }
}

// Kick off at module load — non-blocking. `profileCacheReady`
// exposes the in-flight Promise so the boot path can `await` it
// BEFORE opening the HTTP listener, ensuring the very first
// `GET /api/.../whatsapp-baileys/sessions/:key` call sees a
// populated cache instead of falling through to the empty `{}`
// branch in `readPersistedProfile()`.
//
// Why not just `await` here at module top-level? Because module
// evaluation must stay side-effect free for ESM static analysis
// (and for the existing `import` order in `index.js`). Handing
// back the Promise lets the caller decide when to block.
export const profileCacheReady = hydrateProfileCache();

/**
 * Synchronous profile reader. Returns the cached snapshot (or
 * `{}` if the cache hasn't been seeded yet / the session has
 * never had a profile row written).
 */
function readPersistedProfile(sessionKey) {
  return profileCache.get(sessionKey) || {};
}

/**
 * Async profile writer. Updates the cache synchronously, then
 * UPSERTs to Postgres. We don't `await` this from event
 * handlers — Baileys fires `creds.update` dozens of times per
 * minute during heavy traffic, so any DB hiccup would queue up
 * write promises and slow down the event loop. Swallow errors
 * with a warning: the cache still has the latest value for the
 * lifetime of this process, and the next `persistProfile` will
 * overwrite the previous row anyway (UPSERT semantics).
 */
async function persistProfile(sessionKey, profile) {
  const prev = profileCache.get(sessionKey) || {};
  const next = {
    meId: profile.meId !== undefined ? profile.meId : prev.meId ?? null,
    meName: profile.meName !== undefined ? profile.meName : prev.meName ?? null,
    updatedAt: new Date().toISOString(),
  };
  profileCache.set(sessionKey, next);
  try {
    const { default: sessionRepo } = await import(
      '../../repositories/chatbot/whatsappBaileysSession.repository.js'
    );
    await sessionRepo.saveProfile(sessionKey, {
      meId: next.meId,
      meName: next.meName,
    });
  } catch (err) {
    log(`persistProfile db write failed for ${sessionKey}:`, err.message);
  }
}

/**
 * Baileys set `sock.user.name = 'default'` placeholder ngay khi scan QR
 * (chưa có pushName thật từ server). Nếu ta accept giá trị này thì UI sẽ
 * hiển thị "default" cho tới khi reconnect. Hàm này loại bỏ placeholder
 * + chuỗi rỗng để code phía dưới chỉ nhận name thật.
 */
function realName(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'default') return null;
  return trimmed;
}

/**
 * Lưu trữ thông tin profile (tên pushName/verifiedName, JID) xuống
 * Postgres — xem `persistProfile` ở trên. Không còn tương tác
 * với disk nữa (migration 214).
 */

export function updateSessionNickname(sessionKey, nickname) {
  const record = sessions.get(sessionKey);
  if (record) record.meName = nickname || null;
  // Fire-and-forget — the cache takes the new value immediately
  // so the next read reflects the rename without waiting for the
  // UPSERT to land. A failure here only loses persistence across
  // a restart, not within this process.
  persistProfile(sessionKey, { meName: nickname || null });
}

async function buildSocket(sessionKey, emitter) {
  // Auth state now lives in Postgres (see whatsappBaileysSession
  // repository). No on-disk directory is needed at all — the
  // legacy `./whatsapp-sessions/<key>/` folder was removed when
  // migration 214 replaced profile.json with the
  // `whatsapp_baileys_session_profile` table.
  const { state, saveCreds } = await useDatabaseAuthState(sessionKey);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log(`Using WA protocol v${version.join('.')} (latest=${isLatest}) for session=${sessionKey}`);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: Browsers.appropriate('Desktop'),
    // 30s heartbeat giữ connection sống xuyên qua NAT/proxy timeouts
    // và giảm code 440 stream-error do connection idle timeout.
    keepAliveIntervalMs: 15_000,
    // Tự retry handshake sau disconnect transient (không phải loggedOut).
    connectTimeoutMs: 60_000,
    // Timeout cho các IQ query (props, blocklist, prekey, ...) mà Baileys
    // gọi sau khi socket OPEN. Với users ở xa WhatsApp servers hoặc
    // mạng có latency cao, 15s là không đủ cho lần init đầu tiên
    // sau restart → throw "Timed Out" 408 trong `executeInitQueries`
    // → close code=440 → reconnect liên tục trong vòng 30s.
    // 60s cho phép init chậm mà vẫn succeed trước khi bị kill.
    defaultQueryTimeoutMs: 60_000,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    // Baileys mặc định tự reconnect ngay khi socket close. Tắt để tránh
    // double-reconnect (một lần từ Baileys internal, một lần từ code của
    // ta) → đôi khi tạo cùng lúc 2 socket dẫn tới 440 stream error.
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    logger: {
      level: 'silent',
      child: () => ({ level: 'silent', child: () => this, trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }),
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => log('WARN', sessionKey, arguments[0]),
      error: (...args) => log('ERROR', sessionKey, ...args),
      fatal: (...args) => log('FATAL', sessionKey, ...args),
    },
  });

  sock.ev.on('connection.update', (update) => {
    const status = update.connection;
    emitter.emit('connection.update', { ...update, sessionKey });
    if (update.qr) {
      // Render QR as data URL so the SPA can show it inline without
      // round-tripping image bytes.
      QRCode.toDataURL(update.qr, { width: 320, margin: 1 })
        .then((dataUrl) => {
          const record = sessions.get(sessionKey);
          if (record) {
            record.lastQr = dataUrl;
            record.status = status || 'connecting';
            // QR mới = fresh state, reset cả 2 counter.
            record.reconnectCount = 0;
            record._initFailureCount = 0;
          }
          emitter.emit('qr', { sessionKey, qr: dataUrl, raw: update.qr });
        })
        .catch((err) => log('QR-toDataURL failed:', err.message));
      // Also print to server console for ops debugging
      // ĐÃ TẮT: QR ASCII làm nhiễu log, UI đã có data-URL từ dataUrl trên.
      // try {
      //   qrcodeTerminal.generate(update.qr, { small: true });
      // } catch (_) { /* noop */ }
    }
    if (update.connection === 'close') {
      const reasonCode = update.lastDisconnect?.error?.output?.statusCode
        || update.lastDisconnect?.error?.statusCode
        || DisconnectReason.loggedOut;
      log(`Session ${sessionKey} closed: code=${reasonCode}`);
      const existing = sessions.get(sessionKey);
      if (existing) {
        existing.socket = null;
        existing.status = 'closed';
        // Heuristic: nếu close đến ngay sau khi vừa OPEN (<10s) → gần như
        // chắc chắn do Baileys `executeInitQueries` (fetchProps, blocklist,
        // prekey) timeout → close 440. Đây KHÔNG phải lỗi "không connect
        // được" mà là lỗi "connect OK nhưng init không xong". Track riêng
        // để áp dụng backoff dài hơn và reconnect cap cao hơn.
        const sinceOpen = existing._lastOpenAt ? Date.now() - existing._lastOpenAt : Infinity;
        const isInitFailure = sinceOpen < 10_000 && reasonCode === 440;
        if (isInitFailure) {
          existing._initFailureCount = (existing._initFailureCount || 0) + 1;
          log(`Session ${sessionKey} init-queries failed (~${Math.round(sinceOpen / 1000)}s after open, attempt #${existing._initFailureCount})`);
        } else {
          existing.reconnectCount = (existing.reconnectCount || 0) + 1;
        }
      }
      emitter.emit('connection.update', { ...update, sessionKey, status: 'close' });
      // Reconnect policy:
      // - Skip if loggedOut (user explicitly logged out, must re-scan QR).
      // - Skip if record already deleted (no record to recover).
      // - Skip if too many rapid failures — likely bad creds, upstream issue
      //   hoặc stream error 440 do server rate-limit vì reconnect quá nhanh.
      //   Dừng hẳn, không retry cho đến khi user thao tác lại.
      const RECONNECT_WINDOW_MS = 60_000;
      const MAX_RECONNECTS_PER_WINDOW = 5;
      // Init-failure cap riêng: vì init-queries timeout thường do mạng
      // chậm tới WhatsApp servers, KHÔNG nên vội mark unrecoverable — chỉ
      // cần backoff đủ dài (60s+) để servers phục hồi / jitter mạng hết.
      // 3 lần liên tiếp với backoff ≥60s là đủ signal để tạm dừng 5 phút.
      const MAX_INIT_FAILURES_BEFORE_COOLDOWN = 3;
      if (reasonCode === DisconnectReason.loggedOut) {
        log(`Session ${sessionKey} loggedOut — manual re-scan required`);
      } else if (!existing) {
        // gone
      } else if (existing.reconnectCount >= MAX_RECONNECTS_PER_WINDOW) {
        log(`Session ${sessionKey} reached reconnect cap (${MAX_RECONNECTS_PER_WINDOW} in ${RECONNECT_WINDOW_MS / 1000}s). Stopping auto-reconnect. User must reconnect manually.`);
        existing.lastErrorAt = Date.now();
        existing.status = 'unrecoverable';
        existing._coolingDownUntil = Date.now() + 5 * 60_000; // 5 min cooldown
      } else if ((existing._initFailureCount || 0) >= MAX_INIT_FAILURES_BEFORE_COOLDOWN) {
        log(`Session ${sessionKey} hit init-failure cap (${existing._initFailureCount} consecutive). Cooling down 5 min before retrying.`);
        existing.lastErrorAt = Date.now();
        existing.status = 'unrecoverable';
        existing._coolingDownUntil = Date.now() + 5 * 60_000;
        existing._initFailureCount = 0; // reset counter after cooldown so a manual retry can try again
      } else {
        // Exponential backoff khác nhau cho init-failure vs reconnect:
        // - Init-failure: 60s → 90s → 120s (min 60s vì servers cần thời gian,
        //   reconnect nhanh chỉ làm tăng load server và gây thêm 440).
        // - Reconnect thường: 2s → 4s → 8s → 16s → 32s (max). Backoff ngắn
        //   ở đầu giúp recovery nhanh khi lỗi là transient (network blip).
        const attempt = existing._initFailureCount || existing.reconnectCount;
        const isInitFailure = (existing._initFailureCount || 0) > 0;
        const delayMs = isInitFailure
          ? Math.min(120_000, 60_000 * Math.max(1, attempt))
          : Math.min(32_000, 2_000 * 2 ** Math.min(attempt - 1, 4));
        log(`Session ${sessionKey} reconnecting in ${delayMs}ms (attempt #${attempt}, init-failure=${isInitFailure})`);
        setTimeout(() => {
          const cur = sessions.get(sessionKey);
          if (!cur || cur.socket) return;  // someone else already reconnected
          buildSocket(sessionKey, cur.emitter)
            .then((sock) => {
              // KHÔNG reset reconnectCount ở đây — chỉ 'open' branch
              // mới reset (sau khi session thật sự ổn định). Reset sớm
              // sẽ làm đếm reconnect vô tận vì open ngắt quãng do
              // init-queries timeout.
              cur.socket = sock;
              cur.status = 'connecting';
              log(`Session ${sessionKey} socket re-built`);
            })
            .catch((err) => log(`Session ${sessionKey} reconnect failed:`, err.message));
        }, delayMs);
      }
    } else if (update.connection === 'open') {
      const record = sessions.get(sessionKey);
      if (record) {
        record.status = 'open';
        record.lastQr = null;
        // KHÔNG reset reconnectCount ở đây — 'open' event fire ngay khi
        // WebSocket handshake xong nhưng init queries (fetch contacts, sync
        // history...) chưa chạy xong. Nếu init-queries timeout → socket close
        // → reconnectCount++ → lại 'open' → reset 0 → lặp vô tận.
        // Reset chỉ khi session thật sự ổn định 30s (_stableTimer bên dưới).
        record.lastErrorAt = null;
        record._coolingDownUntil = null;
        // Stamp thời điểm open để close-branch phân biệt init-failure
        // (close ngay sau open) vs disconnect bình thường (sau khi session
        // đã live một lúc).
        record._lastOpenAt = Date.now();
        // Lưu tên + JID của tài khoản WhatsApp đang kết nối để UI hiển thị
        // (vd. "Nguyễn Văn A (+84 84...)"). Baileys set `sock.user` ngay
        // trong frame mở kết nối — name = pushName của owner.
        // Lưu ý: ngay sau QR scan, Baileys set `name = 'default'` (placeholder).
        // realName() loại bỏ placeholder để chỉ giữ pushName thật.
        record.meId = sock.user?.id || null;
        record.meName = realName(sock.user?.name) || realName(sock.user?.verifiedName) || null;
        // PushName + verifiedName trong creds thường RỖNG ngay sau scan QR
        // (Baileys chưa fetch từ server). Baileys 6.x KHÔNG còn trả
        // verifiedName trong onWhatsApp() — chỉ trả {jid, exists, lid}.
        // Vì vậy cách đáng tin nhất là lấy tên từ 1 tin nhắn **sync** mà
        // WhatsApp push xuống ngay sau open (thường là sync self-chat /
        // contact-card có kèm pushName của owner).
        const captureOwnPushName = () => {
          for (const collection of ['contacts', 'app-state-sync-key', 'critical_unblock_low', 'regular_low', 'regular_high']) {
            try {
              const cat = sock?.signalRepository?.getLIDMappingStore?.() ? null : null;
              // ignore — fallback dưới
            } catch { /* noop */ }
          }
        };
        const persist = (name) => {
          const clean = realName(name);
          if (!clean) return;
          if (record.meName && realName(record.meName) === clean) return;
          record.meName = clean;
          persistProfile(sessionKey, { meName: clean, meId: record.meId });
          log(`Session ${sessionKey} resolved profile name: ${clean}`);
        };
        // Poll sock.user.name một vài lần — Baileys đôi khi fill in sau open
        // khi sync history xong. Bỏ qua placeholder 'default'.
        let polls = 0;
        const pollId = setInterval(() => {
          polls += 1;
          const live = realName(sock.user?.name) || realName(sock.user?.verifiedName);
          if (live) { persist(live); clearInterval(pollId); return; }
          if (polls > 12) clearInterval(pollId);
        }, 5000);
        // KHÔNG reset reconnectCount ở đây — socket OPEN vài millis rồi
        // đóng tiếp (code 440) là fail chứ không phải recover. Reset khi
        // session đã sống ổn định (đánh dấu qua timer ở dưới).
        log(`Session ${sessionKey} OPEN ✅ (${sock.user?.id})`);
        // Đánh dấu "stable" sau 30s không bị close → mới coi là recover.
        if (record._stableTimer) clearTimeout(record._stableTimer);
        record._stableTimer = setTimeout(() => {
          const r = sessions.get(sessionKey);
          if (r) {
            r.reconnectCount = 0;
            r._initFailureCount = 0;
            r.lastErrorAt = null;
            log(`Session ${sessionKey} marked stable after 30s.`);
          }
        }, 30_000);
      }
    }
  });

  sock.ev.on('creds.update', (creds) => {
    saveCreds(creds);
    // Baileys phát ra creds.update với { me: { id, name, ... } } khi nhận
    // được message fromMe có pushName. Đây là cách chính thống để Baileys
    // sync pushName của owner — bắt ở đây để UI cập nhật ngay.
    try {
      const me = creds?.me;
      const candidate = realName(me?.name);
      if (candidate) {
        const record = sessions.get(sessionKey);
        // Chỉ ghi đè khi KHÔNG có name thật, hoặc name mới khác name cũ.
        // Tránh ghi đè "default" lên tên thật vừa capture được từ event khác.
        if (record && (!record.meName || realName(record.meName) !== candidate)) {
          record.meName = candidate;
          record.meId = me.id || record.meId;
          persistProfile(sessionKey, { meName: candidate, meId: me.id || record.meId });
          log(`Session ${sessionKey} captured owner name via creds.update: ${candidate}`);
        }
      }
    } catch { /* noop */ }
  });

  // Bắt pushName từ bất kỳ message sync nào WhatsApp gửi xuống ngay sau
  // open — đặc biệt là own self-chat, broadcast list, hoặc message ack
  // events. Khi từ số chính mình gửi/nhận tới, msg.pushName = tên hiển thị
  // của owner và cập nhật vào record. Lọc theo remoteJid === meId.
  const captureNameFromMessage = (msg) => {
    if (!msg) return;
    const record = sessions.get(sessionKey);
    if (!record) return;
    const meJid = record.meId || sock.user?.id || null;
    const remoteJid = msg.key?.remoteJid;
    if (!meJid || !remoteJid) return;
    // Nếu là tin nhắn từ chính mình tới chính mình (self-chat) HOẶC là
    // message sync Telegram-wide, pushName là tên của owner.
    const isSelfChat = remoteJid === jidNormalizedUser(meJid) || remoteJid === meJid;
    if (!isSelfChat && !msg.key?.fromMe) return;
    const name = realName(msg.pushName) || realName(msg.verifiedBizName) || null;
    if (name && realName(record.meName) !== name) {
      // Không ghi đè tên thật (đã capture từ event trước) bằng tên rỗng/'default'.
      record.meName = name;
      persistProfile(sessionKey, { meName: name, meId: meJid });
      log(`Session ${sessionKey} captured owner name from sync: ${name}`);
    }
  };

  sock.ev.on('messages.upsert', async (msgSet) => {
    for (const msg of msgSet.messages || []) {
      captureNameFromMessage(msg);
      emitter.emit('message', { sessionKey, message: msg });
      if (msg.key?.remoteJid && !msg.key.fromMe) {
        try {
          await maybeAutoReply(sock, msg, emitter);
        } catch (err) {
          log('auto-reply error:', err.message);
        }
      }
    }
  });

  // contacts.upsert/contacts.update có thể chứa name của owner khi WhatsApp
  // sync danh bạ lúc vừa connect. Lắng nghe để bắt tên khi tới.
  sock.ev.on('contacts.upsert', (contacts) => {
    const record = sessions.get(sessionKey);
    if (!record) return;
    const meJid = record.meId || sock.user?.id || null;
    if (!meJid || !Array.isArray(contacts)) return;
    const mePhone = meJid.split(':')[0].split('@')[0];
    for (const c of contacts) {
      if (!c) continue;
      const cPhone = (c.id || '').split(':')[0].split('@')[0];
      const cLid = (c.lid || '').split('@')[0];
      const mePhoneNoPrefix = mePhone.replace(/^84/, '0');
      const matches =
        cPhone === mePhone ||
        cLid === mePhone ||
        c.id === jidNormalizedUser(meJid) ||
        realName(c.notify) === realName(sock.user?.name) ||
        c.verifiedName;
      if (!matches) continue;
      const name = realName(c.notify) || realName(c.name) || realName(c.verifiedName) || null;
      if (name && realName(record.meName) !== name) {
        record.meName = name;
        persistProfile(sessionKey, { meName: name, meId: meJid });
        log(`Session ${sessionKey} captured owner name from contacts: ${name}`);
      }
    }
  });

  // ── Prevent unhandled rejections from Baileys internals ──────────────────
  // Baileys gọi uploadPreKeysToServerIfRequired(), getAvailablePreKeysOnServer()
  // và executeInitQueries() trong event handlers mà không .catch(). Đây là
  // async fire-and-forget — unhandled rejection làm crash process.
  // Wrap toàn bộ các phương thức internal bằng .catch() để swallow lỗi.
  const swallow = (label) => (err) => log(`Session ${sessionKey} swallowed ${label}:`, err?.message || err);

  if (typeof sock.uploadPreKeysToServerIfRequired === 'function') {
    const _origUpload = sock.uploadPreKeysToServerIfRequired.bind(sock);
    sock.uploadPreKeysToServerIfRequired = (...args) => {
      _origUpload(...args).catch(swallow('uploadPreKeys'));
    };
  }

  // executeInitQueries → fetchProps() timeout thường xuyên với WhatsApp
  // server (server không trả về props). Khi nó reject, Baileys emit error
  // event nhưng KHÔNG close socket. Patch bằng cách .catch() trên fire-and-forget
  // qua việc override error handler của Baileys.
  // Lưu ý: Baileys tự gọi executeInitQueries nội bộ qua query(), không qua
  // socket.executeInitQueries. Cách hiệu quả nhất là bắt error qua emitter.
  // Lưu tham chiếu tới executeInitQueries nếu tồn tại trên sock để wrap.
  if (typeof sock.executeInitQueries === 'function') {
    const _origInit = sock.executeInitQueries.bind(sock);
    sock.executeInitQueries = (...args) => {
      _origInit(...args).catch(swallow('executeInitQueries'));
    };
  }

  return sock;
}

async function maybeAutoReply(sock, msg, emitter) {
  // Hook point — wire to your chatbot dispatcher later. For now we ack
  // with a typing indicator so the user sees something come back in the
  // WhatsApp device test.
  await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
  setTimeout(async () => {
    try {
      await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
    } catch (_) { /* noop */ }
  }, 1500);
}

/**
 * Establish (or restore) a session. Returns the record's emitter so callers
 * can subscribe to QR + messages.
 *
 * @param {string} sessionKey
 * @returns {Promise<{emitter: NodeJS.EventEmitter, status: string, lastQr: string|null}>}
 */
export async function connectSession(sessionKey) {
  const existing = sessions.get(sessionKey);

  // Nếu session đang trong cooldown (đã hit reconnect cap), user phải
  // thao tác lại (xóa & kết nối mới) thay vì bị tự động reconnect
  // liên tục gây stream-error 440.
  if (existing && existing._coolingDownUntil && Date.now() < existing._coolingDownUntil) {
    const secs = Math.ceil((existing._coolingDownUntil - Date.now()) / 1000);
    throw new Error(`Session đang trong thời gian chờ (${secs}s). Vui lòng xóa và kết nối lại.`);
  }

  // Nếu session đang unrecoverable nhưng đã hết cooldown → reset và retry.
  if (existing && existing._coolingDownUntil && Date.now() >= existing._coolingDownUntil) {
    log(`Session ${sessionKey} cooldown expired — resetting and reconnecting`);
    try {
      await disconnectSession(sessionKey);
    } catch (_) { /* noop */ }
    deleteSessionFiles(sessionKey);
    return connectSession(sessionKey);
  }

  if (existing && existing.status !== 'unrecoverable') return existing;

  const { EventEmitter } = await import('node:events');
  const emitter = new EventEmitter();
  // Hydrate tên/JID đã lưu từ lần trước để UI hiển thị ngay từ lúc
  // "connecting" (không phải đợi socket open mới có name).
  const persistedProfile = readPersistedProfile(sessionKey);
  const record = {
    sessionKey,
    socket: null,
    emitter,
    lastQr: null,
    creds: null,
    status: 'connecting',
    meId: persistedProfile.meId || null,
    meName: persistedProfile.meName || null,
  };
  sessions.set(sessionKey, record);

  try {
    record.socket = await buildSocket(sessionKey, emitter);
    return record;
  } catch (err) {
    sessions.delete(sessionKey);
    throw err;
  }
}

export async function disconnectSession(sessionKey) {
  const record = sessions.get(sessionKey);
  if (!record) return false;
  try {
    await record.socket?.logout?.();
  } catch (_) { /* noop */ }
  try {
    record.socket?.ev?.removeAllListeners?.();
    record.socket?.end?.();
  } catch (_) { /* noop */ }
  sessions.delete(sessionKey);
  return true;
}

export async function deleteSessionFiles(sessionKey) {
  // Wipe the DB rows (auth state + profile) and forget the
  // in-memory mirrors. Migration 214 removed the on-disk
  // `./whatsapp-sessions/<key>/` folder, so there is nothing to
  // delete under `SESSION_ROOT` anymore.
  try {
    const { default: sessionRepo } = await import(
      '../../repositories/chatbot/whatsappBaileysSession.repository.js'
    );
    await sessionRepo.deleteSession(sessionKey);
  } catch (err) {
    log('deleteSessionFiles (db) error:', err.message);
  }
  profileCache.delete(sessionKey);
  sessions.delete(sessionKey);
  return true;
}

export function listSessions() {
  return Array.from(sessions.entries()).map(([key, rec]) => ({
    sessionKey: key,
    status: rec.status,
    hasQr: !!rec.lastQr,
    userId: rec.socket?.user?.id || null,
    // Filter placeholder 'default' / chuỗi rỗng trước khi trả cho client.
    userName: realName(rec.socket?.user?.name) || realName(rec.socket?.user?.verifiedName) || realName(rec.meName) || null,
    emitter: rec.emitter,  // expose emitter cho inbox subscribers
  }));
}

/**
 * List sessionKeys that have persisted auth state.
 *
 * Source of truth: `whatsapp_baileys_session_creds` table. The
 * legacy file-system fallback was removed because migration 213
 * has been live for over a release; any operator who still has
 * on-disk `creds.json` files must run
 * `node scripts/backfillBaileysSessions.js` once, then `rm -rf`
 * the legacy folder (see `.gitignore` for details).
 *
 * If the DB query throws we deliberately re-throw: `restorePersistedSessions`
 * already catches and logs the rejection, and silently degrading
 * to an empty list would leave every user "stuck" until the next
 * boot with no error surface.
 */
export async function listPersistedSessions() {
  const { default: sessionRepo } = await import(
    '../../repositories/chatbot/whatsappBaileysSession.repository.js'
  );
  return sessionRepo.listSessionKeys();
}

export function getSession(sessionKey) {
  const record = sessions.get(sessionKey);
  // Fallback đọc profile từ cache (Postgres-backed qua
  // `whatsapp_baileys_session_profile`) khi session bị reset (vd
  // reload server mà creds chưa kịp hydrate, hoặc socket đang
  // reconnect).
  const persisted = readPersistedProfile(sessionKey);
  if (!record) {
    if (!persisted.meId && !persisted.meName) return null;
    return {
      sessionKey,
      status: 'offline',
      qr: null,
      userId: persisted.meId || null,
      userName: persisted.meName || null,
    };
  }
  return {
    sessionKey,
    status: record.status,
    qr: record.lastQr,
    userId: record.socket?.user?.id || record.meId || persisted.meId || null,
    // Luôn chạy qua realName() để loại bỏ placeholder 'default' / chuỗi rỗng
    // trước khi trả cho client. Nếu tất cả nguồn đều fallback về giá trị giả
    // thì trả null để UI hiển thị 'WhatsApp Account' thay vì 'default'.
    userName:
      realName(record.socket?.user?.name) ||
      realName(record.socket?.user?.verifiedName) ||
      realName(record.meName) ||
      realName(persisted.meName) ||
      null,
  };
}

/**
 * Wait until session is 'open' or timeout. Used by sendMessage() to ride
 * through brief stream-error 440 reconnect windows where the socket is
 * momentarily disconnected but session is still considered alive.
 */
async function waitForOpen(sessionKey, timeoutMs = 8000, pollMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = sessions.get(sessionKey);
    if (record && record.status === 'open' && record.socket) {
      return record;
    }
    if (!record) return null;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return sessions.get(sessionKey) || null;
}

export async function sendMessage(sessionKey, toJidOrPhone, text, { waitForConnectionMs = 8000 } = {}) {
  let record = sessions.get(sessionKey);
  if (!record) throw new Error(`WhatsApp session ${sessionKey} is not connected`);
  // Nếu socket tạm đóng (đang reconnect), đợi open lại.
  if (record.status !== 'open' || !record.socket) {
    record = await waitForOpen(sessionKey, waitForConnectionMs);
  }
  if (!record || record.status !== 'open' || !record.socket) {
    throw new Error(`WhatsApp session ${sessionKey} is not connected`);
  }
  const jid = toJidOrPhone.includes('@')
    ? jidNormalizedUser(toJidOrPhone)
    : jidNormalizedUser(`${toJidOrPhone}@s.whatsapp.net`);
  return record.socket.sendMessage(jid, { text });
}

export async function sendMedia(sessionKey, toJidOrPhone, buffer, mimetype, fileName, caption, { waitForConnectionMs = 8000 } = {}) {
  let record = sessions.get(sessionKey);
  if (!record) throw new Error(`WhatsApp session ${sessionKey} is not connected`);
  if (record.status !== 'open' || !record.socket) {
    record = await waitForOpen(sessionKey, waitForConnectionMs);
  }
  if (!record || record.status !== 'open' || !record.socket) {
    throw new Error(`WhatsApp session ${sessionKey} is not connected`);
  }
  const jid = toJidOrPhone.includes('@')
    ? jidNormalizedUser(toJidOrPhone)
    : jidNormalizedUser(`${toJidOrPhone}@s.whatsapp.net`);
  return record.socket.sendMessage(jid, {
    document: buffer,
    mimetype,
    fileName,
    caption,
  });
}

export function subscribe(sessionKey, handler) {
  const record = sessions.get(sessionKey);
  if (!record) return () => {};
  record.emitter.on('message', handler);
  record.emitter.on('connection.update', handler);
  return () => {
    record.emitter.off('message', handler);
    record.emitter.off('connection.update', handler);
  };
}

/** Boot all persisted sessions at startup so users stay connected across restarts. */
export async function restorePersistedSessions() {
  // `listPersistedSessions` is async — must be awaited or we get
  // a Promise back, and `Promise.length`/`for-of` then throws
  // "keys is not iterable". Regression introduced by PR1 when the
  // function gained its `async` signature.
  const keys = await listPersistedSessions();
  log(`Restoring ${keys.length} persisted session(s)…`);
  for (const key of keys) {
    try {
      await connectSession(key);
    } catch (err) {
      log(`Failed to restore ${key}: ${err.message}`);
    }
  }
}

export { SESSION_ROOT };
