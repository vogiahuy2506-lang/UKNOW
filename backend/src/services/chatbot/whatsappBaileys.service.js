/**
 * whatsappBaileys.service.js
 *
 * Per-WhatsApp-number session using @whiskeysockets/baileys (the multi-device
 * library that powers Evolution API). Each `sessionKey` represents one phone
 * number; the session state (creds + app-state-sync keys + signal keys) is
 * persisted to `./whatsapp-sessions/<sessionKey>/` so that the user only needs
 * to scan the QR code ONCE per device.
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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';

const SESSION_ROOT = path.resolve(
  process.env.WHATSAPP_BAILEYS_SESSION_DIR
    || path.join(process.cwd(), 'whatsapp-sessions')
);

let sessionRootReady = false;
try {
  if (!existsSync(SESSION_ROOT)) {
    mkdirSync(SESSION_ROOT, { recursive: true });
  }
  sessionRootReady = true;
} catch (err) {
  console.error(
    `[WhatsApp/Baileys] Không tạo được thư mục phiên ${SESSION_ROOT} — kênh WhatsApp sẽ không `
    + 'khả dụng, phần còn lại của backend vẫn chạy bình thường:', err?.message || err
  );
}

export function isSessionRootReady() {
  return sessionRootReady;
}

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

function sessionDir(sessionKey) {
  return path.join(SESSION_ROOT, sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_'));
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
 * Lưu trữ thông tin profile (tên pushName/verifiedName, JID) xuống disk
 * để UI hiển thị ngay cả khi Baileys chưa có name (vd sau khi reconnect
 * mà sock.user.name bị reset). Đây là file metadata thuần tuý, không
 * liên quan tới Baileys auth state.
 */
function readPersistedProfile(sessionKey) {
  try {
    const file = path.join(sessionDir(sessionKey), 'profile.json');
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, 'utf8')) || {};
  } catch { return {}; }
}

export function updateSessionNickname(sessionKey, nickname) {
  const record = sessions.get(sessionKey);
  if (record) record.meName = nickname || null;
  persistProfile(sessionKey, { meName: nickname || null });
}

function persistProfile(sessionKey, profile) {
  if (!sessionRootReady) return;
  try {
    const dir = sessionDir(sessionKey);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'profile.json');
    let prev = {};
    try { prev = JSON.parse(readFileSync(file, 'utf8')) || {}; } catch { prev = {}; }
    writeFileSync(file, JSON.stringify({ ...prev, ...profile, updatedAt: new Date().toISOString() }, null, 2));
  } catch (err) {
    log(`persistProfile error for ${sessionKey}:`, err.message);
  }
}

async function buildSocket(sessionKey, emitter) {
  if (!sessionRootReady) {
    throw new Error(`Thư mục lưu phiên WhatsApp không khả dụng (${SESSION_ROOT})`);
  }
  const dir = sessionDir(sessionKey);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
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
    // Giảm timeout để init-queries fail nhanh, backoff tự tăng theo số lần retry.
    // Tránh đợi 30s mỗi lần timeout → gây cảm giác "treo" và spam log.
    defaultQueryTimeoutMs: 15_000,
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
        existing.reconnectCount = (existing.reconnectCount || 0) + 1;
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
      if (reasonCode === DisconnectReason.loggedOut) {
        log(`Session ${sessionKey} loggedOut — manual re-scan required`);
      } else if (!existing) {
        // gone
      } else if (existing.reconnectCount >= MAX_RECONNECTS_PER_WINDOW) {
        log(`Session ${sessionKey} reached reconnect cap (${MAX_RECONNECTS_PER_WINDOW} in ${RECONNECT_WINDOW_MS / 1000}s). Stopping auto-reconnect. User must reconnect manually.`);
        existing.lastErrorAt = Date.now();
        existing.status = 'unrecoverable';
        existing._coolingDownUntil = Date.now() + 5 * 60_000; // 5 min cooldown
      } else {
        // Exponential backoff: 2s → 4s → 8s → 16s → 32s (max).
        // Backoff ngắn hơn ở đầu giúp recovery nhanh khi lỗi là transient
        // (network blip, WhatsApp server hơi lag). Backoff dài hơn nếu
        // lỗi kéo dài để tránh spam server.
        const attempt = existing.reconnectCount;
        const delayMs = Math.min(32_000, 2_000 * 2 ** Math.min(attempt - 1, 4));
        log(`Session ${sessionKey} reconnecting in ${delayMs}ms (attempt #${attempt})`);
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
  if (!sessionRootReady) {
    throw new Error(
      `Thư mục lưu phiên WhatsApp không khả dụng (${SESSION_ROOT}). Vui lòng kiểm tra quyền hệ thống.`
    );
  }
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

export function deleteSessionFiles(sessionKey) {
  if (!sessionRootReady) return false;
  try {
    const dir = sessionDir(sessionKey);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    sessions.delete(sessionKey);
    return true;
  } catch (err) {
    log('deleteSessionFiles error:', err.message);
    return false;
  }
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

export function listPersistedSessions() {
  if (!sessionRootReady || !existsSync(SESSION_ROOT)) return [];
  return readdirSync(SESSION_ROOT).filter((entry) => {
    const dir = path.join(SESSION_ROOT, entry);
    if (!existsSync(path.join(dir, 'creds.json'))) return false;
    try {
      const creds = JSON.parse(readFileSync(path.join(dir, 'creds.json'), 'utf8'));
      return !!creds.me?.id;
    } catch (_) {
      return false;
    }
  });
}

export function getSession(sessionKey) {
  const record = sessions.get(sessionKey);
  // Fallback đọc từ profile.json khi session bị reset (vd reload server
  // mà creds chưa kịp hydrate, hoặc socket đang reconnect).
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
  if (!sessionRootReady) {
    log(`Thư mục lưu phiên không khả dụng (${SESSION_ROOT}) — bỏ qua khôi phục phiên WhatsApp.`);
    return;
  }
  const keys = listPersistedSessions();
  log(`Restoring ${keys.length} persisted session(s)…`);
  for (const key of keys) {
    try {
      await connectSession(key);
    } catch (err) {
      log(`Failed to restore ${key}: ${err.message}`);
    }
  }
}

export { SESSION_ROOT, sessionRootReady };
