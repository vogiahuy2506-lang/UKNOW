import { promises as fs } from 'fs';
import path from 'path';
import db from '../../config/database.js';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const REF_TABLES = [
  'webchat_messages',
  'chatbot_studio_messages',
  'channel_messages',
  'zalo_personal_messages',
];

function isUndefinedTableError(err) {
  return String(err?.code || '') === '42P01';
}

/**
 * True if any message attachments JSONB references this storage key.
 * Fail-closed: connection / unexpected DB errors propagate; only missing
 * tables (42P01) are skipped. If no table could be queried, throw.
 */
export async function isKeyReferenced(storageKey) {
  let queriedOk = 0;

  for (const table of REF_TABLES) {
    try {
      const { rows } = await db.query(
        `SELECT 1
         FROM ${table} m,
              LATERAL jsonb_array_elements(
                CASE
                  WHEN jsonb_typeof(m.attachments) = 'array' THEN m.attachments
                  ELSE '[]'::jsonb
                END
              ) AS elem
         WHERE elem->>'key' = $1
         LIMIT 1`,
        [storageKey]
      );
      queriedOk += 1;
      if (rows.length > 0) return true;
    } catch (err) {
      if (isUndefinedTableError(err)) {
        console.warn(`[ChatAttachmentCleanup] skip missing table ${table}:`, err.message);
        continue;
      }
      throw err;
    }
  }

  if (queriedOk === 0) {
    const err = new Error(
      'Chat attachment cleanup aborted: no reference tables reachable'
    );
    err.code = 'CHAT_ATTACHMENT_CLEANUP_DB_UNREACHABLE';
    throw err;
  }

  return false;
}

async function listOldChatFiles(dir, olderThanMs, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await listOldChatFiles(full, olderThanMs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.stat(full);
      if (Date.now() - stat.mtimeMs < olderThanMs) continue;
      // Skip sidecar-only entries; main loop deletes sibling .txt
      if (/\.(pdf|docx|xlsx|txt|csv|png|jpe?g|webp)\.txt$/i.test(entry.name)) continue;
      out.push(full);
    } catch {
      // ignore
    }
  }
  return out;
}

function absoluteToStorageKey(absPath) {
  const normalized = path.resolve(absPath);
  const root = path.resolve(UPLOADS_ROOT);
  if (!normalized.startsWith(root + path.sep) && normalized !== root) return null;
  const rel = path.relative(root, normalized).split(path.sep).join('/');
  return `uploads/${rel}`;
}

/**
 * Delete orphan chat attachments older than 90 days (file → DB direction).
 */
export async function cleanupOrphanChatAttachments({ olderThanMs = MAX_AGE_MS } = {}) {
  const chatGlobRoot = UPLOADS_ROOT;
  let userDirs = [];
  try {
    userDirs = await fs.readdir(chatGlobRoot, { withFileTypes: true });
  } catch {
    return { scanned: 0, deleted: 0, skipped: 0 };
  }

  const candidates = [];
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const chatDir = path.join(chatGlobRoot, userDir.name, 'chat');
    await listOldChatFiles(chatDir, olderThanMs, candidates);
  }

  let deleted = 0;
  let skipped = 0;

  for (const abs of candidates) {
    const key = absoluteToStorageKey(abs);
    if (!key || !key.includes('/chat/')) {
      skipped += 1;
      continue;
    }
    const referenced = await isKeyReferenced(key);
    if (referenced) {
      skipped += 1;
      continue;
    }
    try {
      await fs.unlink(abs);
      try {
        await fs.unlink(`${abs}.txt`);
      } catch {
        // no sidecar
      }
      deleted += 1;
    } catch (err) {
      console.warn(`[ChatAttachmentCleanup] failed to delete ${abs}:`, err.message);
      skipped += 1;
    }
  }

  return { scanned: candidates.length, deleted, skipped };
}

export default { cleanupOrphanChatAttachments, isKeyReferenced };
