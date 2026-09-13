/**
 * whatsappBaileysSession.repository.js
 *
 * DB-backed auth state for `@whiskeysockets/baileys`. Each session
 * (identified by `sessionKey`, e.g. `${userId}-${shortKey}`) has two
 * storage slots in Postgres:
 *
 *   1. `whatsapp_baileys_session_creds` — one row per sessionKey,
 *      storing the latest `AuthenticationCreds` blob as JSONB. We
 *      rewrite this row on every Baileys `creds.update` event.
 *
 *   2. `whatsapp_baileys_session_keys` — many rows per sessionKey,
 *      one per (signal-type, id) triple. Baileys calls
 *      `SignalKeyStore.set` with batches of keys on every message
 *      send/receive; we UPSERT each row so re-applying the same
 *      write is idempotent.
 *
 * Why JSONB?
 * ----------
 * Baileys owns the schema of both blobs (`AuthenticationCreds` and
 * each `SignalDataTypeMap[T]`). Their field names and shapes change
 * across major versions of the library. Postgres doesn't need to
 * know — JSONB gives us validation + indexable access without a
 * migration per release.
 */

import db from '../../config/database.js';

/**
 * Throwing wrapper around the `pg` pool. The repo functions return
 * raw rows / values; callers translate to the higher-level shapes
 * Baileys expects (AuthenticationState, SignalKeyStore).
 */
async function _q(sql, params) {
  const { rows } = await db.query(sql, params);
  return rows;
}

class WhatsAppBaileysSessionRepository {
  /**
   * Load the latest creds blob for `sessionKey`. Returns `null` if
   * the session has never been authorised (i.e. user hasn't scanned
   * the QR yet). Baileys treats a `null`/missing creds as "not yet
   * registered" and proceeds to render a QR.
   */
  async loadCreds(sessionKey) {
    const rows = await _q(
      `SELECT creds FROM whatsapp_baileys_session_creds
       WHERE session_key = $1`,
      [sessionKey]
    );
    return rows[0]?.creds ?? null;
  }

  /**
   * Persist the latest creds blob. Overwrites the row if it
   * already exists (UPSERT). Baileys calls this on every
   * `creds.update` event, which fires dozens of times per minute
   * during heavy traffic — keep this single-statement and indexed.
   */
  async saveCreds(sessionKey, creds) {
    await _q(
      `INSERT INTO whatsapp_baileys_session_creds (session_key, creds)
       VALUES ($1, $2)
       ON CONFLICT (session_key) DO UPDATE
         SET creds = EXCLUDED.creds,
             updated_at = NOW()`,
      [sessionKey, creds]
    );
  }

  /**
   * Upsert the lightweight profile blob (meId + meName) for a session.
   *
   * Why a separate repo entry point instead of piggy-backing on
   * saveCreds? Because `profile.json` was historically the ONLY file
   * written outside the auth state — keeping it as its own method
   * (1) makes the call site self-documenting and (2) means a future
   * audit log can show "profile updated" without diffing the much
   * larger AuthenticationCreds blob.
   *
   * Pass `null` for any field to leave it unchanged. We use COALESCE
   * in the UPDATE branch so callers can update meName without
   * clobbering meId (and vice versa).
   */
  async saveProfile(sessionKey, { meId = null, meName = null } = {}) {
    await _q(
      `INSERT INTO whatsapp_baileys_session_profile (session_key, me_id, me_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_key) DO UPDATE
         SET me_id = COALESCE(EXCLUDED.me_id, whatsapp_baileys_session_profile.me_id),
             me_name = COALESCE(EXCLUDED.me_name, whatsapp_baileys_session_profile.me_name),
             updated_at = NOW()`,
      [sessionKey, meId, meName]
    );
  }

  /**
   * Load the profile blob. Returns `{}` for unknown / never-scanned
   * sessions — callers distinguish "absent" via `if ('meId' in row)`
   * because the column is genuinely NULL-able.
   */
  async loadProfile(sessionKey) {
    const rows = await _q(
      `SELECT me_id, me_name FROM whatsapp_baileys_session_profile
       WHERE session_key = $1`,
      [sessionKey]
    );
    if (!rows[0]) return {};
    return {
      meId: rows[0].me_id ?? null,
      meName: rows[0].me_name ?? null,
    };
  }

  /**
   * Bulk-fetch a slice of the Signal key store.
   *
   * `type` is one of Baileys's `SignalDataType` enum members
   * (e.g. `'app-state-sync-key'`, `'pre-key'`, `'session'`).
   * `ids` is the list of keys Baileys wants to load in this batch.
   *
   * Returns a `{ [id]: value }` map so the Baileys side can index
   * without further conversion. Missing rows are simply absent
   * from the map — Baileys treats that as "not in cache, fetch
   * from server", which is the correct behaviour for first-time
   * loads.
   *
   * The `ANY($2::text[])` cast lets us pass a JS array directly;
   * `pg` serialises it as a Postgres array.
   */
  async getKeys(sessionKey, type, ids) {
    if (!ids || ids.length === 0) return {};
    const rows = await _q(
      `SELECT id, value FROM whatsapp_baileys_session_keys
       WHERE session_key = $1
         AND type = $2
         AND id = ANY($3::text[])`,
      [sessionKey, type, ids]
    );
    const out = {};
    for (const r of rows) out[r.id] = r.value;
    return out;
  }

  /**
   * Bulk-write the Signal key store. Baileys passes a `data` object
   * shaped like `{ [type]: { [id]: value | null } }` — `null`
   * means "delete this key".
   *
   * We split into two passes:
   *   - non-null values → UPSERT
   *   - null values → DELETE
   *
   * A single transaction keeps the store consistent if any one
   * statement fails. Postgres UPSERT with `ON CONFLICT DO UPDATE`
   * is fine because the composite PK is (session_key, type, id).
   */
  async setKeys(sessionKey, data) {
    // Short-circuit before opening a transaction so the no-op
    // case stays a single Postgres round-trip away (zero
    // round-trips, in fact). The Baileys gatekeeper calls
    // `set({})` when nothing changed — cheaper to skip the
    // BEGIN/COMMIT pair than to spawn a connection just to
    // commit an empty transaction.
    if (!data || typeof data !== 'object') return;
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const [type, byId] of Object.entries(data || {})) {
        const ids = Object.keys(byId);
        if (ids.length === 0) continue;
        const toUpsert = ids.filter((id) => byId[id] !== null);
        const toDelete = ids.filter((id) => byId[id] === null);

        if (toUpsert.length > 0) {
          // Build a multi-row INSERT. We can't use UNNEST easily
          // here because `value` is JSONB and varies per row, so
          // expand the VALUES list explicitly. Each row ships
          // its own $param tuple to keep parameter types simple.
          const params = [];
          const tuples = [];
          toUpsert.forEach((id, idx) => {
            const base = idx * 4;
            tuples.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`
            );
            params.push(sessionKey, type, id, JSON.stringify(byId[id]));
          });
          await client.query(
            `INSERT INTO whatsapp_baileys_session_keys
               (session_key, type, id, value)
             VALUES ${tuples.join(', ')}
             ON CONFLICT (session_key, type, id) DO UPDATE
               SET value = EXCLUDED.value,
                   updated_at = NOW()`,
            params
          );
        }

        if (toDelete.length > 0) {
          await client.query(
            `DELETE FROM whatsapp_baileys_session_keys
             WHERE session_key = $1
               AND type = $2
               AND id = ANY($3::text[])`,
            [sessionKey, type, toDelete]
          );
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Remove everything related to `sessionKey` from both tables.
   * Called when the user explicitly logs out or when a session
   * is in cooldown / unrecoverable. The service layer is
   * responsible for confirming the user actually asked to log
   * out — this method just executes the SQL.
   */
  async deleteSession(sessionKey) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM whatsapp_baileys_session_keys WHERE session_key = $1',
        [sessionKey]
      );
      await client.query(
        'DELETE FROM whatsapp_baileys_session_creds WHERE session_key = $1',
        [sessionKey]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Boot-time discovery: list every sessionKey that has creds
   * persisted. The session manager calls this on startup so it
   * can rebuild in-memory sessions for users who were connected
   * when the process last shut down.
   *
   * We deliberately don't return the keys themselves — just the
   * sessionKeys — because loading hundreds of creds blobs upfront
   * would be wasteful when only a handful of users reconnect.
   */
  async listSessionKeys() {
    const rows = await _q(
      `SELECT session_key FROM whatsapp_baileys_session_creds
       ORDER BY updated_at DESC`
    );
    return rows.map((r) => r.session_key);
  }
}

export default new WhatsAppBaileysSessionRepository();
