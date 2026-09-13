#!/usr/bin/env node
/**
 * Backfill Telegram mtcute sessions from on-disk SQLite files
 * (`.telegram-sessions/<storageKey>/client.session`) into the
 * Postgres table introduced by migration 217
 * (`telegram_session_state`).
 *
 * Run ONCE on every host that has existing Telegram file-based
 * sessions. After this script reports "all sessions backfilled",
 * the SQLite files are no longer the source of truth, but the
 * directory is NOT deleted here so an operator can roll back if
 * needed. Delete manually with `rm -rf .telegram-sessions` after
 * a successful restart.
 *
 * Usage:
 *   node scripts/backfillTelegramSessionState.js
 *   node scripts/backfillTelegramSessionState.js --dry-run
 *
 * What it reads:
 *
 *   For each `<storageKey>` directory under the session root:
 *     <sessionRoot>/<storageKey>/client.session
 *
 *     mtcute's `SqliteStorage` driver creates the following tables
 *     (see `@mtcute/core/storage/sqlite/repository/*.js`):
 *       auth_keys       (dc INTEGER PRIMARY KEY, key BLOB)
 *       temp_auth_keys  (dc, idx, key BLOB, expires)
 *       key_value       (key TEXT PRIMARY KEY, value BLOB)
 *       peers           (id, hash, isMin, usernames JSON, updated, phone, complete BLOB)
 *       message_refs    (peer_id, chat_id, msg_id)
 *
 * What it writes:
 *
 *   For each `<storageKey>` directory that contains valid auth keys:
 *     INSERT INTO telegram_session_state (telegram_user_id, state)
 *     VALUES (<telegramUserId>, <encrypted blob>)
 *     ON CONFLICT (telegram_user_id) DO UPDATE ...
 *
 *   The blob shape is what `telegramMtProtoStorage.js#save()` writes:
 *
 *     {
 *       kv: { <key>: <Buffer> },
 *       authKeys: {
 *         permanent: { <dc>: <Buffer> },
 *         temp: { "<dc>:<idx>": <Buffer> },
 *         tempExpiry: { "<dc>:<idx>": <expires> }
 *       },
 *       peers: {
 *         entities: { <id>: <peerObj> },
 *         usernameIndex: { <username>: <id> },
 *         phoneIndex: { <phone>: <id> }
 *       },
 *       refMessages: { refs: { <peerId>: [<msgKey>, ...] } }
 *     }
 *
 *   Wrapped in `encryptChannelSessionBlob` (AES-256-GCM keyed off
 *   `SMTP_SECRET_KEY` — same wire format as WhatsApp Baileys).
 *
 * `<storageKey>` ↔ `telegram_user_id` mapping:
 *
 *   The gateway uses `storageKey = "tg-${telegramUserId}"` for new
 *   clients (see `telegramSessionManager.js`). For pre-215 clients
 *   we fall back to a directory listing of `<sessionRoot>` and try
 *   to recover `telegram_user_id` from the `key_value` table where
 *   mtcute stores `current_user_id` (under the key `current_user_id`
 *   or similar). If we cannot recover it, the script logs a
 *   warning and skips the directory — the operator can manually
 *   re-scan the QR for that account.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import db from '../src/config/database.js';
import {
  encryptChannelSessionBlob as encryptBaileysBlob,
} from '../src/utils/baileysAuthCrypto.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mirror the env-var fallback used in mtProtoTelegramClient.js so
// operators who set `TELEGRAM_SESSION_DIR` point at a non-default
// location still get the right files scanned.
const SESSION_ROOT = path.resolve(
  process.env.TELEGRAM_SESSION_DIR
    || path.join(__dirname, '..', '.telegram-sessions')
);

const isDryRun = process.argv.includes('--dry-run');

/**
 * Open the SQLite file with `better-sqlite3` and pull every row
 * from the 5 mtcute-owned tables. Returns a normalised JS object
 * matching the shape `telegramMtProtoStorage.js#save()` produces.
 */
function readSqliteState(filename) {
  const sqlite = new Database(filename, { readonly: true });
  try {
    // Auth keys — permanent + temp.
    const permanentRows = sqlite
      .prepare('select dc, key from auth_keys')
      .all();
    const tempRows = sqlite
      .prepare('select dc, idx, key, expires from temp_auth_keys')
      .all();
    // KV — generic blob store. mtcute uses it for future salts,
    // default DC list, current-user info, updates state.
    const kvRows = sqlite
      .prepare('select key, value from key_value')
      .all();
    // Peers — User/Chat metadata cache. Stored as
    // `{ id, hash, isMin, usernames (JSON), updated, phone, complete (BLOB) }`.
    const peerRows = sqlite
      .prepare(
        'select id, hash, isMin, usernames, updated, phone, complete from peers'
      )
      .all();
    // Reference messages — `{ peerId, chatId, msgId }`.
    const refRows = sqlite
      .prepare('select peer_id, chat_id, msg_id from message_refs')
      .all();

    const kv = {};
    for (const row of kvRows) {
      kv[row.key] = row.value;
    }

    const authPermanent = {};
    for (const row of permanentRows) {
      authPermanent[String(row.dc)] = row.key;
    }
    const authTemp = {};
    const authTempExpiry = {};
    for (const row of tempRows) {
      authTemp[`${row.dc}:${row.idx}`] = row.key;
      authTempExpiry[`${row.dc}:${row.idx}`] = row.expires;
    }

    const peerEntities = {};
    const usernameIndex = {};
    const phoneIndex = {};
    for (const row of peerRows) {
      const peer = {
        id: row.id,
        accessHash: row.hash,
        isMin: row.isMin === 1,
        usernames: row.usernames ? JSON.parse(row.usernames) : [],
        updated: row.updated,
        phone: row.phone || undefined,
        complete: row.complete,
      };
      peerEntities[String(row.id)] = peer;
      for (const username of peer.usernames) {
        usernameIndex[username] = row.id;
      }
      if (peer.phone) {
        phoneIndex[peer.phone] = row.id;
      }
    }

    const refs = {};
    for (const row of refRows) {
      const key = `${row.chat_id}:${row.msg_id}`;
      if (!refs[String(row.peer_id)]) refs[String(row.peer_id)] = [];
      refs[String(row.peer_id)].push(key);
    }

    return {
      kv,
      authKeys: {
        permanent: authPermanent,
        temp: authTemp,
        tempExpiry: authTempExpiry,
      },
      peers: {
        entities: peerEntities,
        usernameIndex,
        phoneIndex,
      },
      refMessages: { refs },
    };
  } finally {
    sqlite.close();
  }
}

/**
 * mtcute stores `current_user_id` and related fields under specific
 * keys in `key_value` once `tg.start()` has completed at least once.
 * We try a handful of known keys; if none match, the caller will
 * skip the directory and log a warning.
 *
 * Key history (looking at mtcute's `CurrentUserService`):
 *   - `current_user_id` (long as buffer)
 *   - `current_is_bot` (boolean as buffer)
 *   - `current_is_premium` (boolean)
 *   - `current_user_complete` (TL-serialized User)
 *
 * `current_user_id` is the one we care about.
 */
function tryRecoverTelegramUserId(state) {
  if (!state.kv || typeof state.kv !== 'object') return null;
  // mtcute writes it as a 64-bit Long packed into 8 bytes; the
  // driver wraps it in `{ type: 'Buffer', data: [...] }` when it
  // comes back through JSON. The raw SQLite value, however, is a
  // plain Node Buffer.
  const raw = state.kv.current_user_id;
  if (!raw) return null;
  // `Buffer.readBigInt64BE` handles big-endian 8-byte longs.
  let buf = raw;
  if (buf && typeof buf === 'object' && buf.type === 'Buffer' && Array.isArray(buf.data)) {
    buf = Buffer.from(buf.data);
  }
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  try {
    // Telegram user ids are positive 32-bit integers (mod 2^32). The
    // MTProto long packs the upper 4 bytes as zero for user ids, so
    // we read low 4 bytes.
    const low = Number(buf.readBigInt64LE(0) & 0xffffffffn);
    return low > 0 ? low : null;
  } catch {
    return null;
  }
}

/**
 * Try to recover `telegram_user_id` from the `key_value` table.
 * Returns the numeric id, or `null` if recovery failed.
 */
function readTelegramUserIdFromSqlite(filename) {
  const sqlite = new Database(filename, { readonly: true });
  try {
    const rows = sqlite
      .prepare('select key, value from key_value')
      .all();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const fakeState = { kv: map };
    return tryRecoverTelegramUserId(fakeState);
  } finally {
    sqlite.close();
  }
}

async function backfill() {
  if (!existsSync(SESSION_ROOT)) {
    console.log(`[telegram-backfill] ${SESSION_ROOT} does not exist — nothing to do.`);
    return { ok: 0, skipped: 0, failed: 0 };
  }
  // mtcute writes one SQLite file per account at
  // `<sessionRoot>/<storageKey>/client.session`. The default
  // `storageKey` was `"default"` pre-215 and `"tg-<id>"` post-215.
  const entries = readdirSync(SESSION_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  console.log(`[telegram-backfill] Found ${entries.length} candidate storageKey(s) under ${SESSION_ROOT}`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const storageKey of entries) {
    const dbFile = path.join(SESSION_ROOT, storageKey, 'client.session');
    if (!existsSync(dbFile)) {
      console.log(`[telegram-backfill] ${storageKey}: no client.session — skipping`);
      skipped += 1;
      continue;
    }

    let state;
    try {
      state = readSqliteState(dbFile);
    } catch (err) {
      console.warn(`[telegram-backfill] ${storageKey}: failed to read SQLite (${err.message}) — skipping`);
      failed += 1;
      continue;
    }

    // Determine the Telegram user id. New clients use
    // `tg-<id>` directly; legacy ones (storageKey=default, or
    // arbitrary) need to read it from the kv table.
    let telegramUserId = null;
    const directMatch = /^tg-(\d+)$/.exec(storageKey);
    if (directMatch) {
      telegramUserId = Number(directMatch[1]);
    } else {
      try {
        telegramUserId = readTelegramUserIdFromSqlite(dbFile);
      } catch (err) {
        console.warn(`[telegram-backfill] ${storageKey}: failed to recover user id (${err.message}) — skipping`);
        failed += 1;
        continue;
      }
    }
    if (!telegramUserId) {
      console.warn(
        `[telegram-backfill] ${storageKey}: could not determine telegram_user_id ` +
          '(no `tg-<id>` prefix and no current_user_id in kv) — skipping. ' +
          'Re-scan the QR for this account from the SPA to populate Postgres.'
      );
      skipped += 1;
      continue;
    }

    // Sanity check — auth_keys should be non-empty for a logged-in
    // account. Skip empty files (pre-scan or abandoned) to avoid
    // polluting Postgres with no-op rows.
    const hasAuthKeys = Object.keys(state.authKeys?.permanent || {}).length > 0;
    if (!hasAuthKeys) {
      console.log(`[telegram-backfill] ${storageKey}: no permanent auth_keys — skipping (pre-scan or abandoned)`);
      skipped += 1;
      continue;
    }

    if (isDryRun) {
      console.log(
        `[telegram-backfill] DRY-RUN ${storageKey} -> telegram_user_id=${telegramUserId}: ` +
          `authKeys=${Object.keys(state.authKeys.permanent).length} kv=${Object.keys(state.kv).length} ` +
          `peers=${Object.keys(state.peers.entities).length}`
      );
      ok += 1;
      continue;
    }

    const encrypted = encryptBaileysBlob(state);
    await db.query(
      `INSERT INTO telegram_session_state (telegram_user_id, state)
       VALUES ($1, $2)
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         state = EXCLUDED.state,
         updated_at = NOW()`,
      [telegramUserId, encrypted]
    );
    console.log(
      `[telegram-backfill] ${storageKey} -> telegram_user_id=${telegramUserId}: persisted ` +
        `(${Object.keys(state.authKeys.permanent).length} auth keys, ${Object.keys(state.kv).length} kv rows, ` +
        `${Object.keys(state.peers.entities).length} peers)`
    );
    ok += 1;
  }

  return { ok, skipped, failed };
}

(async () => {
  try {
    const { ok, skipped, failed } = await backfill();
    console.log(
      `[telegram-backfill] Done. ok=${ok} skipped=${skipped} failed=${failed}` +
        (isDryRun ? ' (dry-run — nothing written)' : '')
    );
    await db.pool.end();
  } catch (err) {
    console.error('[telegram-backfill] FATAL:', err);
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
})();
