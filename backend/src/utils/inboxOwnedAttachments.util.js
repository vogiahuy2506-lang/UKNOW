import uploadController from '../controllers/upload.controller.js';
import { verifyFileToken } from './fileDownloadToken.js';

/**
 * Resolve a storage key from attachment payload.
 * Prefers explicit key / uploads/ paths; falls back to signed /file/<token> URLs
 * (persistChatBlob returns those — no raw key to the client).
 *
 * @param {unknown} att
 * @returns {string}
 */
export function resolveInboxAttachmentStorageKey(att) {
  if (att == null) return '';

  const direct = uploadController.normalizeStorageKey(att);
  if (direct) return direct;

  const raw = typeof att === 'object'
    ? (att.url || att.link || att.attachmentUrl || '')
    : String(att || '');
  const text = String(raw || '').trim();
  if (!text) return '';

  let pathname = text;
  try {
    pathname = new URL(text).pathname || '';
  } catch {
    // relative path e.g. /file/token/download
  }

  const match = String(pathname).match(/\/file\/([^/]+)/i);
  if (!match) return '';

  try {
    const decoded = verifyFileToken(decodeURIComponent(match[1]));
    return uploadController.normalizeStorageKey(decoded?.sk || '');
  } catch {
    return '';
  }
}

/**
 * Sanitize client-provided inbox attachments: keep only keys owned by user under chat/.
 * Returns DB/send shape { key, displayName?, size?, mime?, type? } — never client URLs.
 *
 * @param {unknown} attachments
 * @param {number|string} ownerUserId
 * @returns {Array<{key: string, displayName?: string, size?: number, mime?: string, type?: string}>}
 */
export function sanitizeOwnedInboxAttachments(attachments, ownerUserId) {
  const uid = String(ownerUserId ?? '').trim();
  if (!uid) return [];
  const ownerPrefix = `uploads/${uid}/chat/`;
  const list = Array.isArray(attachments) ? attachments : [];
  const out = [];

  for (const att of list) {
    if (!att || typeof att !== 'object') continue;
    const key = resolveInboxAttachmentStorageKey(att);
    if (!key || !key.startsWith(ownerPrefix)) continue;
    if (!uploadController.normalizeStorageKey(key)) continue;

    const item = { key };
    const displayName = att.displayName || att.name || null;
    if (displayName) item.displayName = String(displayName).slice(0, 255);
    if (att.size != null && Number.isFinite(Number(att.size))) item.size = Number(att.size);
    const mime = att.mime || att.contentType || null;
    if (mime) item.mime = String(mime);
    if (att.type === 'image' || att.type === 'file') item.type = att.type;
    out.push(item);
  }

  return out;
}
