#!/usr/bin/env node
/**
 * Backfill WhatsApp Baileys sessions from `./whatsapp-sessions/<key>/`
 * into the Postgres tables introduced by migration 213 (auth state)
 * and migration 214 (profile metadata).
 *
 * Run ONCE on every host that has existing Baileys file-based
 * sessions. After this script reports "all sessions backfilled",
 * the file-system directory is no longer the source of truth
 * — the service now reads from Postgres — but the directory is
 * NOT deleted here so an operator can roll back if needed.
 * Delete manually with `rm -rf whatsapp-sessions/` after a
 * successful restart.
 *
 * Usage:
 *   node scripts/backfillBaileysSessions.js
 *   node scripts/backfillBaileysSessions.js --dry-run
 *
 * What it reads:
 *   whatsapp-sessions/<sessionKey>/creds.json
 *   whatsapp-sessions/<sessionKey>/app-state-sync-key-*.json
 *   whatsapp-sessions/<sessionKey>/app-state-sync-version-*.json
 *   whatsapp-sessions/<sessionKey>/pre-key-*.json
 *   whatsapp-sessions/<sessionKey>/sender-key-*.json
 *   whatsapp-sessions/<sessionKey>/session-*.json
 *   whatsapp-sessions/<sessionKey>/device-list-*.json
 *   whatsapp-sessions/<sessionKey>/lid-mapping-*.json
 *   whatsapp-sessions/<sessionKey>/profile.json     (migration 214)
 *
 * The file naming convention matches what
 * `useMultiFileAuthState` writes — one JSON file per signal key.
 * Keys that don't match any known prefix (e.g. a leftover
 * debug file) are skipped with a warning.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../src/config/database.js';
import sessionRepo from '../src/repositories/chatbot/whatsappBaileysSession.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mirror the env-var fallback used in whatsappBaileys.service.js so
// an operator who set WHATSAPP_BAILEYS_SESSION_DIR points at a
// non-default location still gets the right files scanned.
const SESSION_ROOT = path.resolve(
  process.env.WHATSAPP_BAILEYS_SESSION_DIR
    || path.join(__dirname, '..', 'whatsapp-sessions')
);

// Map the per-file basename to the `type` column used in the new
// schema. Baileys' own `useMultiFileAuthState` writes files named
// `${type}-${id}.json` — for example `app-state-sync-key-abc123.json`.
// We split on the FIRST hyphen so types with internal hyphens
// (e.g. `app-state-sync-key`) stay intact.
const KNOWN_TYPES = [
  'app-state-sync-key',
  'app-state-sync-version',
  'pre-key',
  'sender-key',
  'session',
  'device-list',
  'lid-mapping',
];

function splitTypeAndId(filename) {
  for (const type of KNOWN_TYPES) {
    const prefix = `${type}-`;
    if (filename.startsWith(prefix)) {
      return { type, id: filename.slice(prefix.length, -'.json'.length) };
    }
  }
  return null;
}

const isDryRun = process.argv.includes('--dry-run');

async function backfill() {
  if (!existsSync(SESSION_ROOT)) {
    console.log(`[backfill] ${SESSION_ROOT} does not exist — nothing to do.`);
    return { credsCount: 0, keyCount: 0 };
  }
  const sessionKeys = readdirSync(SESSION_ROOT).filter((entry) => {
    const full = path.join(SESSION_ROOT, entry);
    return existsSync(path.join(full, 'creds.json'));
  });
  console.log(`[backfill] Found ${sessionKeys.length} candidate session(s).`);
  let credsCount = 0;
  let keyCount = 0;
  let profileCount = 0;
  for (const sessionKey of sessionKeys) {
    const dir = path.join(SESSION_ROOT, sessionKey);
    const credsPath = path.join(dir, 'creds.json');
    let creds;
    try {
      creds = JSON.parse(readFileSync(credsPath, 'utf8'));
    } catch (err) {
      console.warn(`[backfill] ${sessionKey}: failed to parse creds.json (${err.message}) — skipping`);
      continue;
    }
    // Skip creds that never finished a login. `me.id` is the most
    // reliable signal that the user actually scanned the QR.
    if (!creds?.me?.id) {
      console.log(`[backfill] ${sessionKey}: creds has no me.id — skipping (pre-scan or abandoned)`);
      continue;
    }
    if (isDryRun) {
      console.log(`[backfill] DRY-RUN ${sessionKey}: would upsert creds + ${readdirSync(dir).length - 1} key file(s)`);
      credsCount += 1;
      continue;
    }
    await sessionRepo.saveCreds(sessionKey, creds);
    credsCount += 1;
    // Migration 214: backfill profile metadata. The on-disk
    // profile.json is best-effort — fall back to me.id + me.name
    // from creds itself if the file is missing or corrupted.
    const profilePath = path.join(dir, 'profile.json');
    let profile = {};
    if (existsSync(profilePath)) {
      try {
        profile = JSON.parse(readFileSync(profilePath, 'utf8')) || {};
      } catch (err) {
        console.warn(`[backfill] ${sessionKey}: profile.json unreadable (${err.message}) — using creds.me`);
      }
    }
    const meId = profile.meId || creds.me.id || null;
    const meName = profile.meName || creds.me.name || null;
    if (meId || meName) {
      await sessionRepo.saveProfile(sessionKey, { meId, meName });
      profileCount += 1;
    }
    // Walk every other JSON file and translate filename → (type, id).
    for (const entry of readdirSync(dir)) {
      if (entry === 'creds.json' || entry === 'profile.json') continue;
      if (!entry.endsWith('.json')) continue;
      const split = splitTypeAndId(entry);
      if (!split) {
        console.warn(`[backfill] ${sessionKey}: unknown filename ${entry} — skipping`);
        continue;
      }
      let value;
      try {
        value = JSON.parse(readFileSync(path.join(dir, entry), 'utf8'));
      } catch (err) {
        console.warn(`[backfill] ${sessionKey}: failed to parse ${entry} (${err.message}) — skipping`);
        continue;
      }
      await sessionRepo.setKeys(sessionKey, { [split.type]: { [split.id]: value } });
      keyCount += 1;
    }
    console.log(`[backfill] ${sessionKey}: creds + ${keyCount} keys persisted`);
  }
  return { credsCount, keyCount, profileCount };
}

(async () => {
  try {
    const { credsCount, keyCount, profileCount } = await backfill();
    console.log(
      `[backfill] Done. sessions=${credsCount} keys=${keyCount} profiles=${profileCount}` +
        (isDryRun ? ' (dry-run — nothing written)' : '')
    );
    await db.pool.end();
  } catch (err) {
    console.error('[backfill] FATAL:', err);
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
})();
