import { promises as fs } from 'fs';
import path from 'path';
import db from '../../config/database.js';
import uploadController from '../../controllers/upload.controller.js';
import { markDeletedAfterUnlink } from '../storage/storageObject.service.js';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const REF_CONFIGS = [
  { table: 'webchat_messages', column: 'attachments' },
  { table: 'chatbot_messages', column: 'attachments' },
  { table: 'chatbot_studio_messages', column: 'attachments' },
  { table: 'channel_messages', column: 'attachments' },
  { table: 'zalo_personal_messages', column: 'attachments' },
  { table: 'ai_chat_messages', column: 'data' },
];

function isUndefinedTableError(err) {
  return String(err?.code || '') === '42P01' || String(err?.code || '') === '42703';
}

function isEnoent(err) {
  return err?.code === 'ENOENT';
}

/**
 * True if any message attachments JSONB/data references this storage key.
 * Fail-closed: connection / unexpected DB errors propagate; only missing
 * tables/columns (42P01, 42703) are skipped. If no table could be queried, throw.
 */
export async function isKeyReferenced(storageKey) {
  let queriedOk = 0;

  for (const { table, column } of REF_CONFIGS) {
    try {
      const { rows } = await db.query(
        `SELECT 1
         FROM ${table} m
         WHERE m.${column}::text LIKE $1
         LIMIT 1`,
        [`%${storageKey}%`]
      );
      queriedOk += 1;
      if (rows.length > 0) return true;
    } catch (err) {
      if (isUndefinedTableError(err)) {
        console.warn(`[ChatAttachmentCleanup] skip missing table/column ${table}.${column}:`, err.message);
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

/**
 * True if storage_key already has a catalog row (managed by expires_at pass).
 * Fail-closed on unexpected DB errors.
 */
export async function isKeyInCatalog(storageKey) {
  const { rows } = await db.query(
    `SELECT 1 FROM chat_attachments WHERE storage_key = $1 LIMIT 1`,
    [storageKey]
  );
  return rows.length > 0;
}

async function unlinkQuiet(absPath) {
  try {
    await fs.unlink(absPath);
  } catch (err) {
    if (!isEnoent(err)) throw err;
  }
}

/**
 * Pass 1: delete expired catalog rows + their files/sidecars.
 * Query failure must throw (do not continue to orphan sweep).
 */
export async function cleanupExpiredCatalogRows() {
  const { rows } = await db.query(
    `SELECT id, storage_key
     FROM chat_attachments
     WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  );

  let rowsDeleted = 0;
  let filesDeleted = 0;

  for (const row of rows) {
    try {
      const referenced = await isKeyReferenced(row.storage_key);
      if (referenced) {
        console.warn(
          `[ChatAttachmentCleanup] CẢNH BÁO: Catalog row ${row.id} (${row.storage_key}) đã hết hạn nhưng đang được tin nhắn tham chiếu! Bỏ qua không xóa.`
        );
        continue;
      }
    } catch (refErr) {
      console.warn(
        `[ChatAttachmentCleanup] Không thể kiểm tra tham chiếu cho catalog row ${row.id} (${row.storage_key}):`,
        refErr.message
      );
      continue;
    }

    const abs = uploadController.resolveAbsolutePathFromKey(row.storage_key);
    let removed = false;
    if (abs) {
      try {
        await markDeletedAfterUnlink({
          storageKey: row.storage_key,
          physicalPaths: [abs, `${abs}.txt`],
        });
        filesDeleted += 1;
        removed = true;
      } catch (err) {
        console.warn(
          `[ChatAttachmentCleanup] failed to unlink expired ${row.storage_key}:`,
          err.message
        );
      }
    } else {
      console.warn(
        `[ChatAttachmentCleanup] skip unsafe/invalid key for expired row ${row.id}: ${row.storage_key}`
      );
    }

    if (removed) {
      await db.query(`DELETE FROM chat_attachments WHERE id = $1`, [row.id]);
      rowsDeleted += 1;
    }
  }

  return { expiredScanned: rows.length, rowsDeleted, filesDeleted };
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
 * Two-pass cleanup:
 *  1) Catalog rows past expires_at → unlink file+sidecar + DELETE row
 *  2) Legacy orphans on disk (>90d, not in REF_TABLES, not in catalog)
 */
export async function cleanupOrphanChatAttachments({
  olderThanMs = MAX_AGE_MS,
  deleteUntracked = String(process.env.STORAGE_RECONCILE_DELETE_UNTRACKED || '')
    .trim()
    .toLowerCase() === 'true',
} = {}) {
  // Pass 1 first — if DB is down, throw before any unlink in either pass.
  const expired = await cleanupExpiredCatalogRows();

  const chatGlobRoot = UPLOADS_ROOT;
  let userDirs = [];
  try {
    userDirs = await fs.readdir(chatGlobRoot, { withFileTypes: true });
  } catch {
    return {
      scanned: expired.expiredScanned,
      deleted: expired.filesDeleted,
      rowsDeleted: expired.rowsDeleted,
      skipped: 0,
      untrackedDeleteEnabled: deleteUntracked,
      untrackedDeleteCandidates: 0,
    };
  }

  const candidates = [];
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const chatDir = path.join(chatGlobRoot, userDir.name, 'chat');
    await listOldChatFiles(chatDir, olderThanMs, candidates);
  }

  let deleted = expired.filesDeleted;
  let skipped = 0;
  let untrackedDeleteCandidates = 0;

  for (const abs of candidates) {
    const key = absoluteToStorageKey(abs);
    if (!key || !key.includes('/chat/')) {
      skipped += 1;
      continue;
    }

    // Guard: catalog-managed files are owned by expires_at pass — never orphan-delete them.
    if (await isKeyInCatalog(key)) {
      skipped += 1;
      continue;
    }

    const referenced = await isKeyReferenced(key);
    if (referenced) {
      skipped += 1;
      continue;
    }
    untrackedDeleteCandidates += 1;
    if (!deleteUntracked) {
      skipped += 1;
      continue;
    }
    try {
      await unlinkQuiet(abs);
      await unlinkQuiet(`${abs}.txt`);
      deleted += 1;
    } catch (err) {
      console.warn(`[ChatAttachmentCleanup] failed to delete ${abs}:`, err.message);
      skipped += 1;
    }
  }

  return {
    scanned: expired.expiredScanned + candidates.length,
    deleted,
    rowsDeleted: expired.rowsDeleted,
    skipped,
    untrackedDeleteEnabled: deleteUntracked,
    untrackedDeleteCandidates,
  };
}

export default {
  cleanupOrphanChatAttachments,
  cleanupExpiredCatalogRows,
  isKeyReferenced,
  isKeyInCatalog,
};
