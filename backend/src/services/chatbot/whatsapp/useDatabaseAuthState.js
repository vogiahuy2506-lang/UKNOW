/**
 * useDatabaseAuthState.js
 *
 * Custom Baileys auth-state store backed by Postgres (via the
 * `whatsappBaileysSession.repository`). Replaces the old file-based
 * `useMultiFileAuthState(dir)` flow so the in-process gateway keeps
 * working across container restarts, multi-instance rollouts, and
 * new hosts without a manual fs copy step.
 *
 * Wire-up:
 *
 *   const { state, saveCreds } = await useDatabaseAuthState(sessionKey);
 *   const sock = makeWASocket({
 *     auth: {
 *       creds: state.creds,
 *       keys: makeCacheableSignalKeyStore(state.keys, logger),
 *     },
 *     ...,
 *   });
 *   sock.ev.on('creds.update', saveCreds);
 *
 * Baileys emits `creds.update` whenever the underlying
 * `AuthenticationCreds` change (login, profile update, 2FA, etc.).
 * The Signal keys (`pre-key`, `session`, `app-state-sync-key`,
 * `sender-key`, `app-state-sync-version`, `lid-mapping`,
 * `device-list`) are written through `state.keys.set` as Baileys
 * processes outbound and inbound messages. Both paths land in
 * Postgres without any extra glue.
 *
 * Why a wrapper module (not exported from the service):
 * - Keeps the SQL coupling isolated so unit tests can swap the
 *   repo without touching `whatsappBaileys.service.js`.
 * - Mirrors the `useMultiFileAuthState` shape so callers don't
 *   have to learn a new API.
 */

import { initAuthCreds } from '@whiskeysockets/baileys';
import sessionRepo from '../../../repositories/chatbot/whatsappBaileysSession.repository.js';
import {
  decryptBaileysBlob,
  encryptBaileysBlob,
} from '../../../utils/baileysAuthCrypto.util.js';

/**
 * Build the auth state for `sessionKey`. Returns the same shape
 * Baileys' built-in `useMultiFileAuthState` does:
 *
 *   { state: AuthenticationState, saveCreds: () => Promise<void> }
 *
 * `state.creds` is whatever Postgres returned, or a freshly
 * generated `initAuthCreds()` blob if no row exists yet (first
 * QR scan before any write).
 *
 * `state.keys.get(type, ids)` reads from the key table.
 *
 * `state.keys.set(data)` upserts non-null values and deletes
 * null values, all inside a single transaction so a partial
 * write never leaves the store in an inconsistent state.
 *
 * `saveCreds()` is invoked by the caller on every
 * `creds.update` event. It writes the latest `AuthenticationCreds`
 * blob (not a delta) so we never have to track what's changed
 * — Baileys sends the full object each time.
 */
export async function useDatabaseAuthState(sessionKey) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    throw new Error('useDatabaseAuthState requires a non-empty sessionKey');
  }
  // Repo returns the raw JSONB value: either a legacy plaintext
  // `AuthenticationCreds` blob, or our `{ enc: "enc:v1:..." }`
  // wrapper. Decrypt here so callers always see a parsed
  // `AuthenticationCreds` (or null → initAuthCreds()).
  const stored = decryptBaileysBlob(await sessionRepo.loadCreds(sessionKey));
  const creds = stored ?? initAuthCreds();

  const keys = {
    /**
     * Bulk fetch. `type` is one of Baileys' `SignalDataType` enum
     * members; `ids` is the list of keys Baileys needs for this
     * call. Returns `{ [id]: value }` so the Baileys side can
     * index without further conversion.
     */
    /**
     * Bulk read. Each row's `value` is decrypted on the fly — the
     * repo returns the raw JSONB payload (either the legacy
     * plaintext Baileys key, or our `{ enc: "enc:v1:..." }`
     * wrapper). Map each value through `decryptBaileysBlob` so the
     * caller sees the same shape Baileys put in.
     */
    async get(type, ids) {
      if (!Array.isArray(ids) || ids.length === 0) return {};
      const raw = await sessionRepo.getKeys(sessionKey, type, ids);
      const out = {};
      for (const id of Object.keys(raw)) {
        out[id] = decryptBaileysBlob(raw[id]);
      }
      return out;
    },

    /**
     * Bulk write. `data` is shaped as
     * `{ [type]: { [id]: value | null } }` — `null` means delete.
     * Anything we can't write inside this single transaction
     * (because of a unique constraint violation, connection
     * drop, etc.) bubbles up to the gateway's reconnect logic.
     *
     * Encrypt every non-null value before handing it to the repo
     * so the on-disk row matches the `enc:v1:` family used by
     * Zalo cookies and SMTP passwords. `null` passes through
     * untouched so the repo can issue its DELETE statement.
     */
    async set(data) {
      if (!data || typeof data !== 'object') return;
      const wrapped = {};
      for (const type of Object.keys(data)) {
        const inner = data[type] || {};
        const out = {};
        for (const id of Object.keys(inner)) {
          const v = inner[id];
          out[id] = v === null ? null : encryptBaileysBlob(v);
        }
        wrapped[type] = out;
      }
      await sessionRepo.setKeys(sessionKey, wrapped);
    },

    /**
     * Optional but useful for tests: empty the key store for
     * this session. The Baileys interface documents this as
     * part of `SignalKeyStore` but never invokes it itself; we
     * expose the repo's `deleteSession` via the same hook so
     * future tooling (e.g. an admin "force re-scan" button)
     * doesn't need a separate import.
     */
    async clear() {
      await sessionRepo.deleteSession(sessionKey);
    },
  };

  return {
    state: { creds, keys },
    /**
     * Save the latest creds blob. Called from the service layer
     * on every `sock.ev.on('creds.update', ...)` event. Wraps
     * the repo call so a future migration (e.g. encryption at
     * rest) lands in one place.
     */
    async saveCreds() {
      await sessionRepo.saveCreds(sessionKey, encryptBaileysBlob(creds));
    },
  };
}

export default useDatabaseAuthState;
