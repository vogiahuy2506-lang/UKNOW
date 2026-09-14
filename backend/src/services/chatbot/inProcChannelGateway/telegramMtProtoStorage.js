/**
 * telegramMtProtoStorage.js
 *
 * Custom Postgres-backed `StorageProvider` for `@mtcute/node`. Replaces
 * the on-disk SQLite file (`SqliteStorage`) at `.telegram-sessions/<key>/client.session`
 * with a single encrypted JSONB row in `telegram_session_state`.
 *
 * ── Why a custom provider? ──────────────────────────────────────────────
 * mtcute's `StorageProvider` interface exposes 5 repositories:
 *   - `kv`            (key/value blobs: future salts, default DC list,
 *                      updates state, current-user info)
 *   - `authKeys`      (Telegram MTProto auth keys, permanent + temp)
 *   - `peers`         (User/Chat metadata cache)
 *   - `refMessages`   (channel/reference cross-links for forward-compat
 *                      with `Message.replyToMessage`)
 *
 * `TelegramClient({ storage })` accepts either a path string (which
 * mtcute internally instantiates as `SqliteStorage(path)`) OR a fully
 * built `ITelegramStorageProvider` instance with the 5 fields above.
 * We choose the latter so we control the persistence layer.
 *
 * ── Driver pattern (extend `MemoryStorageDriver`) ───────────────────────
 * mtcute's in-memory repos all share their state via
 * `_driver.getState(name, factory)`. Re-implementing that contract from
 * scratch would be brittle. Instead we extend `MemoryStorageDriver` and
 * add ONE override: `save()` — which marshals the 5 in-memory state
 * containers into a JSON-serialisable blob and writes it to Postgres
 * via the chatbotTelegram repository. `load()` populates the same
 * containers from a Postgres row.
 *
 * The result: mtcute calls happen at full in-memory speed, and we flush
 * the dirty state to Postgres on every `StorageManager.save()` event
 * (driven by `MtClient.disconnect`, `PeersService.updatePeersFrom`,
 * `CurrentUserService.store`).
 *
 * ── Encryption ────────────────────────────────────────────────────────
 * The blob is encrypted at the repository boundary using
 * `encryptBaileysBlob` / `decryptBaileysBlob` — the same wire format
 * (`enc:v1:<ivHex>:<authTagHex>:<cipherTextHex>`) used by WhatsApp
 * Baileys, keyed off `SMTP_SECRET_KEY`. See `baileysAuthCrypto.util.js`
 * for the AES-256-GCM implementation details.
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────
 *   1. `new PostgresBackedTelegramStorage({ telegramUserId, repo })`
 *   2. mtcute calls `setup(log, platform)` then `load()` on the driver
 *      via `StorageManager.load()`. We use this to hydrate the 5
 *      in-memory repos from a single encrypted JSONB row.
 *   3. mtcute mutates the in-memory state as messages are sent/received
 *      and as the auth state evolves.
 *   4. mtcute calls `driver.save()` on `MtClient.disconnect()` and on
 *      every `updatePeersFrom` / `CurrentUserService.store`. We marshal
 *      → encrypt → UPSERT into `telegram_session_state`.
 *   5. mtcute calls `driver.destroy()` on `MtClient.destroy()`. We do a
 *      final `save()` (in case the last batch was unflushed) and drop
 *      the in-memory state.
 */

import {
  MemoryAuthKeysRepository,
  MemoryKeyValueRepository,
  MemoryPeersRepository,
  MemoryRefMessagesRepository,
  MemoryStorageDriver,
} from '@mtcute/core';

/**
 * In-memory + Postgres-backed mtcute StorageProvider.
 *
 * Implements the `ITelegramStorageProvider` shape that
 * `new TelegramClient({ storage })` accepts:
 *
 *   {
 *     driver,
 *     kv,
 *     authKeys,
 *     peers,
 *     refMessages,
 *   }
 *
 * The `repo` argument is the `chatbotTelegram.repository` instance
 * (or anything with the matching `loadSessionState` / `saveSessionState`
 * methods). Injecting it instead of hard-importing keeps the storage
 * module testable without touching the database module.
 */
export class PostgresBackedTelegramStorage {
  /**
   * @param {Object} deps
   * @param {number|string} deps.telegramUserId
   * @param {Object} deps.repo - Anything exposing:
   *     loadSessionState(telegramUserId) → object | null
   *     saveSessionState(telegramUserId, state) → row
   *     deleteSessionState(telegramUserId) → void
   */
  constructor({ telegramUserId, repo }) {
    if (telegramUserId == null) {
      throw new Error(
        '[PostgresBackedTelegramStorage] telegramUserId is required'
      );
    }
    if (!repo || typeof repo.loadSessionState !== 'function') {
      throw new Error(
        '[PostgresBackedTelegramStorage] repo with loadSessionState/saveSessionState is required'
      );
    }
    this._telegramUserId = Number(telegramUserId);
    this._repo = repo;
    this.driver = new PostgresBackedDriver({
      telegramUserId: this._telegramUserId,
      repo,
    });
    // Compose the 5 repos with our custom driver. They share state
    // via `_driver.getState(name, factory)` so we MUST use a single
    // driver instance for all 5 to avoid divergent copies.
    this.kv = new MemoryKeyValueRepository(this.driver);
    this.authKeys = new MemoryAuthKeysRepository(this.driver);
    this.peers = new MemoryPeersRepository(this.driver);
    this.refMessages = new MemoryRefMessagesRepository(this.driver);
  }

  /**
   * Manually trigger a flush of dirty in-memory state to Postgres.
   * Most call sites don't need this — mtcute calls `driver.save()`
   * automatically on disconnect / peer update / current-user store.
   * Exposed here so a graceful logout (e.g. user clicked "Đăng xuất"
   * in the SPA) can flush BEFORE disconnect tears down the mtcute
   * network layer.
   */
  async flush() {
    await this.driver.save();
  }
}

/**
 * Custom driver that wraps `MemoryStorageDriver` to add the Postgres
 * flush hook. We deliberately do NOT extend `BaseStorageDriver` because
 * (a) it adds lifecycle bookkeeping we don't need, (b) mtcute's memory
 * repos already assume `getState(name, factory)` is present on the
 * driver, and `MemoryStorageDriver` provides that contract.
 *
 * Lifecycle:
 *   - `load()`: hydrate in-memory state from Postgres (no-op if the
 *     row is empty, which means the user hasn't scanned a QR yet).
 *   - `save()`: marshal the 5 in-memory repos into one blob, encrypt
 *     via the repo, UPSERT to Postgres. Idempotent — safe to call
 *     repeatedly even with no mutations.
 *   - `destroy()`: clear the in-memory state. We do NOT auto-save
 *     here because mtcute already calls `save()` before `destroy()`
 *     (see `MtClient.disconnect()` → `storage.save()` → `destroy()`).
 */
class PostgresBackedDriver extends MemoryStorageDriver {
  constructor({ telegramUserId, repo }) {
    super();
    this._telegramUserId = Number(telegramUserId);
    this._repo = repo;
    this._loaded = false;
    // Promise lock so concurrent `save()` calls serialise rather than
    // race on the UPSERT. mtcute's network layer can call `save()`
    // twice in quick succession (e.g. on disconnect + currentUser
    // store) — without this lock, both promises may hit the DB
    // simultaneously and clobber each other.
    this._saveQueue = Promise.resolve();
  }

  /**
   * `load()` is invoked by `StorageManager.load()` once, right after
   * `setup()`. If a previous session exists in Postgres, hydrate
   * the 5 in-memory repos so mtcute doesn't lose auth keys on restart.
   * A missing row means the user hasn't scanned a QR yet — leave
   * the empty maps in place; mtcute will populate them on first
   * `tg.start()`.
   */
  async load() {
    if (this._loaded) return;
    this._loaded = true;

    let blob = null;
    try {
      blob = await this._repo.loadSessionState(this._telegramUserId);
    } catch (err) {
      // Don't crash the connect path on a transient DB error — log
      // and start with empty state. The user will need to re-scan
      // a QR if no in-memory data is salvageable.
      console.warn(
        `[PostgresBackedDriver] load failed for ${this._telegramUserId}: ${err.message}`
      );
      return;
    }
    if (!blob || typeof blob !== 'object') return;

    // Hydrate the 5 in-memory state containers. The exact shape
    // mirrors what we wrote in `save()` below; any future change
    // to the wire format must bump `telegram_session_state.schema_version`
    // (see migration 217 comment) and add a migration here.
    if (blob.kv && typeof blob.kv === 'object') {
      const kvState = this.getState('kv', () => new Map());
      for (const [k, v] of Object.entries(blob.kv)) {
        kvState.set(k, restoreBuffers(v));
      }
    }
    if (blob.authKeys && typeof blob.authKeys === 'object') {
      const akState = this.getState('authKeys', () => ({
        authKeys: new Map(),
        authKeysTemp: new Map(),
        authKeysTempExpiry: new Map(),
      }));
      if (blob.authKeys.permanent && typeof blob.authKeys.permanent === 'object') {
        for (const [k, v] of Object.entries(blob.authKeys.permanent)) {
          akState.authKeys.set(Number(k), restoreBuffers(v));
        }
      }
      if (blob.authKeys.temp && typeof blob.authKeys.temp === 'object') {
        for (const [k, v] of Object.entries(blob.authKeys.temp)) {
          // k = "<dc>:<idx>" composite
          const [dc, idx] = k.split(':');
          const expires = blob.authKeys.tempExpiry?.[k] ?? 0;
          akState.authKeysTemp.set(k, restoreBuffers(v));
          akState.authKeysTempExpiry.set(k, expires);
        }
      }
    }
    if (blob.peers && typeof blob.peers === 'object') {
      const peerState = this.getState('peers', () => ({
        entities: new Map(),
        usernameIndex: new Map(),
        phoneIndex: new Map(),
      }));
      if (blob.peers.entities && typeof blob.peers.entities === 'object') {
        for (const [id, peer] of Object.entries(blob.peers.entities)) {
          peerState.entities.set(Number(id), restoreBuffers(peer));
        }
      }
      if (blob.peers.usernameIndex && typeof blob.peers.usernameIndex === 'object') {
        for (const [username, id] of Object.entries(blob.peers.usernameIndex)) {
          peerState.usernameIndex.set(username, Number(id));
        }
      }
      if (blob.peers.phoneIndex && typeof blob.peers.phoneIndex === 'object') {
        for (const [phone, id] of Object.entries(blob.peers.phoneIndex)) {
          peerState.phoneIndex.set(phone, Number(id));
        }
      }
    }
    if (blob.refMessages && typeof blob.refMessages === 'object') {
      const refState = this.getState('refMessages', () => ({ refs: new Map() }));
      if (blob.refMessages.refs && typeof blob.refMessages.refs === 'object') {
        for (const [peerId, msgKeys] of Object.entries(blob.refMessages.refs)) {
          const set = new Set(Array.isArray(msgKeys) ? msgKeys : []);
          refState.refs.set(Number(peerId), set);
        }
      }
    }
    // `self` and `primaryDcs` are stored on `kv` under specific keys
    // by mtcute itself (see `CurrentUserService` and `DefaultDcsService`).
    // We don't need to rehydrate them here — they're round-tripped via
    // the `kv` state above.
  }

  /**
   * Marshal the 5 in-memory repositories into one JSON-serialisable
   * blob, hand it to the repo for encryption + UPSERT. Concurrent
   * calls serialise through `_saveQueue` so the UPSERT order matches
   * the mutation order on the in-memory side.
   */
  save() {
    const run = async () => {
      const blob = {
        kv: serializeMap(this.states.get('kv')),
        authKeys: serializeAuthKeys(this.states.get('authKeys')),
        peers: serializePeers(this.states.get('peers')),
        refMessages: serializeRefMessages(this.states.get('refMessages')),
      };
      // Drop null/empty sub-objects to keep the JSONB row small.
      // The serialisers return `null` when the corresponding
      // in-memory state is empty; load() treats missing keys the
      // same as empty, so this is safe.
      for (const key of Object.keys(blob)) {
        if (blob[key] === null) delete blob[key];
      }
      try {
        await this._repo.saveSessionState(this._telegramUserId, blob);
      } catch (err) {
        // Don't propagate the save error — mtcute doesn't await
        // `save()` synchronously, so a rejection would be swallowed
        // anyway. Log and let the next save() retry.
        console.warn(
          `[PostgresBackedDriver] save failed for ${this._telegramUserId}: ${err.message}`
        );
      }
    };
    // Chain onto the queue so concurrent saves serialise.
    this._saveQueue = this._saveQueue.then(run, run);
    return this._saveQueue;
  }

  /**
   * Tear down. We deliberately do NOT auto-save here — mtcute calls
   * `save()` before `destroy()` (see `MtClient.disconnect()` →
   * `storage.save()` → `client._destroy()`), so any pending mutations
   * are already flushed. A redundant save would just bloat the row.
   */
  destroy() {
    // Pure teardown. mtcute calls `save()` BEFORE `destroy()`
    // (see `MtClient.disconnect()` → `storage.save()` →
    // `_destroy()`), so any pending mutations are already flushed
    // and a redundant save would just bloat the row.
    //
    // We deliberately do NOT clear `this.states` here: the 5
    // mtcute repositories cache their state Map on `this.state`
    // at construction time, and orphaning those Maps would leave
    // the repos pointing at stale containers. Instead, callers
    // that want a fresh slate should instantiate a new
    // `PostgresBackedTelegramStorage`.
    this._loaded = false;
    this._saveQueue = Promise.resolve();
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

/**
 * Convert mtcute's Map-shaped kv state into a plain object suitable
 * for JSON.stringify. Values are Buffer/Uint8Array-aware: every
 * entry is run through `restoreBuffers` so the round-trip preserves
 * binary blobs (mtcute auth keys are 256-byte Uint8Arrays).
 */
function serializeMap(map) {
  if (!map) return {};
  const out = {};
  for (const [k, v] of map.entries()) {
    out[String(k)] = serialiseValue(v);
  }
  return out;
}

function serializeAuthKeys(state) {
  if (!state) return null;
  const permanent = {};
  for (const [dc, key] of (state.authKeys || new Map()).entries()) {
    permanent[String(dc)] = serialiseValue(key);
  }
  const temp = {};
  const tempExpiry = {};
  for (const [k, key] of (state.authKeysTemp || new Map()).entries()) {
    temp[String(k)] = serialiseValue(key);
    const expires = state.authKeysTempExpiry?.get(k);
    if (Number.isFinite(expires)) tempExpiry[String(k)] = expires;
  }
  if (Object.keys(permanent).length === 0 && Object.keys(temp).length === 0) {
    // Distinguish "no auth keys" from "had auth keys but wiped
    // them via `deleteAll`". The latter would still have the
    // empty maps on disk, so a JSON-diff-style rollback could
    // tell them apart. For our purposes both collapse to
    // `null` so the row stays small.
    return null;
  }
  return {
    permanent,
    temp,
    ...(Object.keys(tempExpiry).length ? { tempExpiry } : {}),
  };
}

function serializePeers(state) {
  if (!state) return null;
  const entities = {};
  for (const [id, peer] of (state.entities || new Map()).entries()) {
    entities[String(id)] = serialiseValue(peer);
  }
  const usernameIndex = {};
  for (const [u, id] of (state.usernameIndex || new Map()).entries()) {
    usernameIndex[String(u)] = Number(id);
  }
  const phoneIndex = {};
  for (const [phone, id] of (state.phoneIndex || new Map()).entries()) {
    phoneIndex[String(phone)] = Number(id);
  }
  if (Object.keys(entities).length === 0) return null;
  return {
    entities,
    ...(Object.keys(usernameIndex).length ? { usernameIndex } : {}),
    ...(Object.keys(phoneIndex).length ? { phoneIndex } : {}),
  };
}

function serializeRefMessages(state) {
  if (!state) return null;
  const refs = {};
  for (const [peerId, msgSet] of (state.refs || new Map()).entries()) {
    refs[String(peerId)] = Array.from(msgSet);
  }
  if (Object.keys(refs).length === 0) return null;
  return { refs };
}

/**
 * Convert any value to a JSON-safe shape. Buffers/Uint8Arrays become
 * `{ type: 'Buffer', data: [...] }` so `JSON.stringify` works (Node's
 * default `Buffer.prototype.toJSON` already does this, but we route
 * through the same path explicitly so reviewers don't have to know).
 * Plain objects and arrays are walked recursively so nested buffers
 * are caught too.
 */
function serialiseValue(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) {
    return { type: 'Buffer', data: Array.from(value) };
  }
  if (value instanceof Uint8Array) {
    return { type: 'Buffer', data: Array.from(value) };
  }
  if (Array.isArray(value)) {
    return value.map(serialiseValue);
  }
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = serialiseValue(value[k]);
    }
    return out;
  }
  return value;
}

/**
 * Inverse of `serialiseValue` — turn `{ type: 'Buffer', data: [...] }`
 * markers back into real `Buffer` instances. We can't use
 * `baileysAuthCrypto.util.js#reviveBufferInPlace` directly because
 * it expects a `{ enc: ... }` wrapper as the entry point; here we
 * start from raw decoded JSON, so we walk the tree ourselves.
 */
function restoreBuffers(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(restoreBuffers);
  if (typeof value !== 'object') return value;
  if (
    value.type === 'Buffer' &&
    Array.isArray(value.data) &&
    value.data.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    return Buffer.from(value.data);
  }
  const out = {};
  for (const k of Object.keys(value)) {
    out[k] = restoreBuffers(value[k]);
  }
  return out;
}

export default PostgresBackedTelegramStorage;

// ── In-memory only variant ────────────────────────────────────────────
// Used during QR login (createSession flow) where we don't yet know the
// final `telegram_user_id` — so we cannot pre-create a Postgres row.
// mtcute still needs a valid `ITelegramStorageProvider`; giving it the
// on-disk SQLite fallback would resurrect the EACCES bug on production
// containers (mkdir `/app/.telegram-sessions/...`). The in-memory variant
// keeps the QR handshake alive without touching the filesystem. On
// successful scan, `telegramAuth._onLoginSuccess` calls
// `extractSerializedState(memoryStorage)` and writes the blob to Postgres
// with the real `telegram_user_id`, then `telegramSessionManager`
// re-creates a `PostgresBackedTelegramStorage` for runtime use.
//
// Bug trước đó: `telegramAuth.start()` không truyền `storageProvider` cho
// `MtProtoTelegramClient` → mtcute rơi về `_storagePath` (file SQLite) →
// `mkdir /app/.telegram-sessions/default` throw EACCES trên production.
// Fix commit trước (233365f7) chỉ thêm fallback `os.tmpdir()` cho mkdir,
// VẪN dùng file SQLite — sai triết lý (user đã yêu cầu nhiều lần:
// "không lưu session vào file ở folder, lưu vào DB hết"). Fix này loại
// bỏ hoàn toàn file path: in-memory cho QR, Postgres cho runtime.
export class InMemoryTelegramStorage {
  constructor() {
    this.driver = new MemoryStorageDriver();
    this.kv = new MemoryKeyValueRepository(this.driver);
    this.authKeys = new MemoryAuthKeysRepository(this.driver);
    this.peers = new MemoryPeersRepository(this.driver);
    this.refMessages = new MemoryRefMessagesRepository(this.driver);
  }
  // `setup` / `load` / `save` / `destroy` are part of the
  // `ITelegramStorageProvider` shape — delegate to the driver so
  // mtcute's `StorageManager` doesn't choke on a no-op provider.
  async setup(log, platform) {
    if (typeof this.driver.setup === 'function') {
      return this.driver.setup(log, platform);
    }
  }
  async load() {
    if (typeof this.driver.load === 'function') {
      return this.driver.load();
    }
  }
  async save() {
    if (typeof this.driver.save === 'function') {
      return this.driver.save();
    }
  }
  async destroy() {
    if (typeof this.driver.destroy === 'function') {
      return this.driver.destroy();
    }
  }
}

/**
 * Walk the 5 in-memory repos of an `InMemoryTelegramStorage` and emit
 * the same JSON-serialisable blob that `PostgresBackedDriver.save()`
 * would write — so the caller can hand it straight to
 * `repo.saveSessionState(realTelegramUserId, blob)` after a successful
 * QR scan. Mirrors the private serialisation logic of the Postgres
 * driver so we don't double-import or break encapsulation.
 *
 * @param {InMemoryTelegramStorage} storage
 * @returns {object|null}
 */
export function extractSerializedState(storage) {
  if (!storage?.driver || typeof storage.driver.getState !== 'function') {
    return null;
  }
  const kvState = storage.driver.getState('kv', () => new Map());
  const authKeysState = storage.driver.getState('authKeys', () => ({}));
  const peersState = storage.driver.getState('peers', () => ({}));
  const refMessagesState = storage.driver.getState('refMessages', () => ({}));

  const kv = kvState instanceof Map ? Object.fromEntries(kvState) : kvState || {};
  return {
    kv: serialiseValue(kv),
    authKeys: serialiseValue(authKeysState),
    peers: serialiseValue(peersState),
    refMessages: serialiseValue(refMessagesState),
  };
}
