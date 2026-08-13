import { promises as fs } from 'fs';
import path from 'path';
import uploadController from '../../controllers/upload.controller.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import { signChatAttachmentRef, resolveChatAttachmentRef } from '../../utils/chatAttachmentRef.js';
import { MAX_UPLOAD_FILE_BYTES } from '../../utils/uploadLimits.util.js';
import db from '../../config/database.js';

export const MAX_FILES_PER_MESSAGE = 3;
export const MAX_FILE_BYTES = MAX_UPLOAD_FILE_BYTES;
export const MAX_IMAGE_BYTES = MAX_UPLOAD_FILE_BYTES;
export const TEXT_PER_FILE_CHARS = 8000;
export const TEXT_BUDGET_CHARS = 12000;
export const PDF_MAX_PAGES = 30;
export const PARSE_TIMEOUT_MS = 20_000;
export const MAX_IMAGES_LATEST_TURN = 2;
export const CHAT_ATTACHMENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const CHAT_ATTACHMENT_SOURCES = Object.freeze({
  WEB: 'chatbot_web',
  STUDIO: 'chatbot_studio',
  ASSISTANT: 'ai_assistant',
  INBOX_OUTBOUND: 'inbox_outbound',
});

const DOC_ALLOW = [
  { mime: 'application/pdf', exts: ['.pdf'], magic: [0x25, 0x50, 0x44, 0x46], kind: 'doc' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    exts: ['.docx'],
    magic: [0x50, 0x4b, 0x03, 0x04],
    kind: 'doc',
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    exts: ['.xlsx'],
    magic: [0x50, 0x4b, 0x03, 0x04],
    kind: 'doc',
  },
  { mime: 'text/plain', exts: ['.txt'], magic: null, kind: 'doc' },
  { mime: 'text/csv', exts: ['.csv'], magic: null, kind: 'doc' },
];

const IMAGE_ALLOW = [
  { mime: 'image/png', exts: ['.png'], magic: [0x89, 0x50, 0x4e, 0x47], kind: 'image' },
  { mime: 'image/jpeg', exts: ['.jpg', '.jpeg'], magic: [0xff, 0xd8, 0xff], kind: 'image' },
  { mime: 'image/webp', exts: ['.webp'], magic: 'webp', kind: 'image' },
];

const ALL_ALLOW = [...DOC_ALLOW, ...IMAGE_ALLOW];

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function matchesMagic(buffer, magic) {
  if (!magic) return true;
  if (magic === 'webp') {
    if (buffer.length < 12) return false;
    const riff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const webp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return riff && webp;
  }
  if (buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
}

/**
 * Validate file against allowlist (mime + extension pair) and magic bytes.
 * @returns {{ kind: 'image'|'doc', mime: string, ext: string }}
 */
export function validateFile({ buffer, originalName, mimetype }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw httpError('File trống hoặc không hợp lệ');
  }

  const name = String(originalName || '');
  const rawExt = path.extname(name).toLowerCase();
  const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();

  if (rawExt === '.doc' || mime === 'application/msword') {
    throw httpError('Chỉ nhận .docx, hãy Lưu thành .docx rồi gửi lại');
  }
  if (rawExt === '.svg' || mime === 'image/svg+xml') {
    throw httpError('Không nhận file SVG');
  }

  const rule = ALL_ALLOW.find((r) => r.mime === mime && r.exts.includes(rawExt));
  if (!rule) {
    throw httpError('Định dạng file không được hỗ trợ. Nhận PDF, DOCX, XLSX, TXT, CSV, PNG, JPEG, WEBP');
  }

  if (!matchesMagic(buffer, rule.magic)) {
    throw httpError('Nội dung file không khớp định dạng khai báo');
  }

  const maxBytes = rule.kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (buffer.length > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw httpError(`File vượt dung lượng tối đa ${mb} MB`);
  }

  return { kind: rule.kind, mime: rule.mime, ext: rule.exts[0] };
}

async function extractWithTimeout(buffer, originalName, mime, options = {}) {
  const parsePromise = extractTextFromBuffer(buffer, originalName, mime, options);
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('PARSE_TIMEOUT')), PARSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([parsePromise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function resolveSource({ source, bind = {} } = {}) {
  if (source && Object.values(CHAT_ATTACHMENT_SOURCES).includes(source)) return source;
  if (bind.sid) return CHAT_ATTACHMENT_SOURCES.WEB;
  if (bind.uid != null) return CHAT_ATTACHMENT_SOURCES.STUDIO;
  return CHAT_ATTACHMENT_SOURCES.STUDIO;
}

/**
 * Insert catalog row — fail-soft (file on disk remains usable for chat).
 */
export async function insertChatAttachmentRow({
  ownerUserId,
  source,
  storageKey,
  displayName,
  mimeType,
  sizeBytes,
  conversationRef = null,
  expiresAt = null,
}) {
  const expires = expiresAt || new Date(Date.now() + CHAT_ATTACHMENT_TTL_MS);
  try {
    await db.query(
      `INSERT INTO chat_attachments
         (id_user, source, storage_key, display_name, mime_type, size_bytes, conversation_ref, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (storage_key) DO NOTHING`,
      [
        ownerUserId,
        source,
        storageKey,
        displayName || null,
        mimeType || null,
        sizeBytes ?? null,
        conversationRef,
        expires,
      ]
    );
  } catch (err) {
    console.warn('[ChatAttachment] catalog insert failed:', err.message);
  }
}

/**
 * Persist blob under uploads/<owner>/chat/ + sidecar + catalog row.
 * Does NOT sign chat refs (Assistant has no chatbotId).
 */
export async function persistChatBlob({
  buffer,
  originalName,
  mimetype,
  ownerUserId,
  source,
  conversationRef = null,
}) {
  const { kind, mime, ext } = validateFile({ buffer, originalName, mimetype });

  const safeBase = uploadController.sanitizeFileBaseName(originalName);
  const key = `uploads/${ownerUserId}/chat/${Date.now()}_${safeBase}${ext}`;
  const absPath = uploadController.resolveAbsolutePathFromKey(key);
  if (!absPath) {
    throw httpError('Không thể lưu file', 500);
  }

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buffer);

  let textExtracted = kind === 'image';
  if (kind === 'doc') {
    let text = '';
    try {
      text = await extractWithTimeout(buffer, `${safeBase}${ext}`, mime, { max: PDF_MAX_PAGES });
      text = String(text || '').slice(0, TEXT_PER_FILE_CHARS);
      if (text.trim().length >= 10) {
        textExtracted = true;
        console.log(`[ChatAttachment] extracted ${text.length} chars from ${safeBase}${ext}`);
      } else {
        text = '';
        textExtracted = false;
      }
    } catch (err) {
      console.warn(`[ChatAttachment] extract failed: ${err.message}`);
      text = '';
      textExtracted = false;
    }
    const sidecarPath = `${absPath}.txt`;
    await fs.writeFile(sidecarPath, text, 'utf8');
  }

  const displayName = sanitizeDisplayName(originalName);
  const expiresAt = new Date(Date.now() + CHAT_ATTACHMENT_TTL_MS);
  const resolvedSource = resolveSource({ source });

  await insertChatAttachmentRow({
    ownerUserId,
    source: resolvedSource,
    storageKey: key,
    displayName,
    mimeType: mime,
    sizeBytes: buffer.length,
    conversationRef,
    expiresAt,
  });

  const type = kind === 'image' ? 'image' : 'file';
  const url = uploadController.buildDownloadUrlByKey(key, { preview: kind === 'image' });

  return {
    type,
    url,
    name: `${safeBase}${ext}`,
    displayName,
    size: buffer.length,
    mime,
    textExtracted,
    _key: key,
    expiresAt,
    source: resolvedSource,
  };
}

/**
 * Store chat attachment under uploads/<ownerUserId>/chat/ and extract text for docs.
 *
 * @param {{ buffer: Buffer, originalName: string, mimetype?: string, ownerUserId: number|string, chatbotId: number|string, bind?: { uid?: *, sid?: * }, source?: string }}
 */
export async function storeChatFile({
  buffer,
  originalName,
  mimetype,
  ownerUserId,
  chatbotId,
  bind = {},
  source,
}) {
  const persisted = await persistChatBlob({
    buffer,
    originalName,
    mimetype,
    ownerUserId,
    source: resolveSource({ source, bind }),
  });

  const ref = signChatAttachmentRef(persisted._key, {
    chatbotId,
    uid: bind.uid ?? null,
    sid: bind.sid ?? null,
  });

  return {
    type: persisted.type,
    url: persisted.url,
    name: persisted.name,
    displayName: persisted.displayName,
    size: persisted.size,
    mime: persisted.mime,
    ref,
    textExtracted: persisted.textExtracted,
    _key: persisted._key,
  };
}

/**
 * Promote Assistant temp upload → durable chat storage + catalog row.
 */
export async function promoteAssistantTempFile({
  tempId,
  originalName,
  contentType,
  size,
  ownerUserId,
}) {
  const buffer = await uploadController.readTempFileBuffer(tempId, originalName);
  const persisted = await persistChatBlob({
    buffer,
    originalName,
    mimetype: contentType,
    ownerUserId,
    source: CHAT_ATTACHMENT_SOURCES.ASSISTANT,
  });
  try {
    await uploadController.deleteTempFileById(tempId, originalName);
  } catch (err) {
    console.warn('[ChatAttachment] temp cleanup after promote failed:', err.message);
  }
  return {
    storage_key: persisted._key,
    originalName: persisted.displayName || originalName,
    contentType: persisted.mime || contentType,
    size: persisted.size ?? size,
    url: persisted.url,
    type: persisted.type,
    displayName: persisted.displayName,
  };
}

export function resolveRef(ref, { chatbotId, uid = null, sid = null } = {}) {
  const data = resolveChatAttachmentRef(ref, { chatbotId, uid, sid });
  return data.sk;
}

export function signRef(key, { chatbotId, uid = null, sid = null } = {}) {
  return signChatAttachmentRef(key, { chatbotId, uid, sid });
}

function mimeFromKey(storageKey) {
  const ext = path.extname(String(storageKey || '')).toLowerCase();
  switch (ext) {
    case '.pdf': return 'application/pdf';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.txt': return 'text/plain';
    case '.csv': return 'text/csv';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: return null;
  }
}

function typeFromKey(storageKey) {
  const mime = mimeFromKey(storageKey);
  return mime && mime.startsWith('image/') ? 'image' : 'file';
}

/** Human-readable name for UI/prompt — never used for disk paths. */
export function sanitizeDisplayName(raw, maxLen = 120) {
  let s = String(raw || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (!s) s = 'tep_dinh_kem';
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/**
 * Resolve client refs → storage shape for DB: { type, url, name, size, mime, key }
 * Ignores any client-supplied `key` / `url` / `mime`.
 */
export function enrichAttachmentsForStorage(attachments, { chatbotId, uid = null, sid = null } = {}) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  if (attachments.length > MAX_FILES_PER_MESSAGE) {
    throw httpError(`Tối đa ${MAX_FILES_PER_MESSAGE} tệp mỗi tin nhắn`);
  }

  const out = [];
  for (const item of attachments) {
    if (!item || typeof item !== 'object') continue;
    const ref = item.ref;
    if (!ref) continue; // ignore bare key / invalid
    let key;
    try {
      key = resolveRef(ref, { chatbotId, uid, sid });
    } catch (err) {
      throw err;
    }
    const type = typeFromKey(key);
    const mime = mimeFromKey(key);
    const safeName = path.basename(key);
    const displayName = sanitizeDisplayName(item.displayName || item.name || safeName);
    out.push({
      type,
      url: uploadController.buildDownloadUrlByKey(key, { preview: type === 'image' }),
      name: safeName,
      displayName,
      size: Number.isFinite(Number(item.size)) ? Number(item.size) : 0,
      mime,
      key,
    });
  }
  return out;
}

/**
 * DB attachments (with key) → client shape (with fresh ref, no key).
 * Rebuilds url/mime from key so stale or hostile stored urls never reach the client.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeRef=true] — inbox display can set false (no need to re-sign)
 */
export function presentAttachmentsForClient(attachments, { chatbotId, uid = null, sid = null, includeRef = true } = {}) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const key = item.key;

    // Channel attachments (Zalo/FB/legacy) have no chat storage key — pass through
    // display fields only. Never forward a stray `key` if somehow present as empty.
    if (!key) {
      const label = item.displayName || item.name || null;
      return {
        type: item.type,
        url: item.url,
        name: label,
        displayName: label,
        size: item.size,
        mime: item.mime,
        ...(item.caption ? { caption: item.caption } : {}),
      };
    }

    const type = typeFromKey(key);
    const label = item.displayName || item.name || path.basename(key);
    const presented = {
      type,
      url: uploadController.buildDownloadUrlByKey(key, { preview: type === 'image' }),
      name: path.basename(key),
      displayName: sanitizeDisplayName(label),
      size: item.size,
      mime: mimeFromKey(key),
    };
    if (includeRef) {
      try {
        presented.ref = signRef(key, { chatbotId, uid, sid });
      } catch {
        // skip ref if sign fails
      }
    }
    return presented;
  });
}

async function readSidecarText(storageKey) {
  const absPath = uploadController.resolveAbsolutePathFromKey(storageKey);
  if (!absPath) return '';
  try {
    const text = await fs.readFile(`${absPath}.txt`, 'utf8');
    return String(text || '').slice(0, TEXT_PER_FILE_CHARS);
  } catch {
    return '';
  }
}

async function readFileBase64(storageKey) {
  const absPath = uploadController.resolveAbsolutePathFromKey(storageKey);
  if (!absPath) return null;
  try {
    const buf = await fs.readFile(absPath);
    return buf.toString('base64');
  } catch {
    return null;
  }
}

/**
 * Build Gemini parts from attachment descriptors.
 * Always requires `ref` + `resolveBind` — never trusts client-supplied `key`.
 *
 * @returns {{ parts: Array, budgetUsed: number }}
 */
export async function buildAiParts({
  attachments = [],
  budgetChars = TEXT_BUDGET_CHARS,
  isLatestTurn = false,
  resolveBind = null,
} = {}) {
  const parts = [];
  let budget = budgetChars;
  let budgetUsed = 0;
  let imagesUsed = 0;

  const list = Array.isArray(attachments) ? [...attachments] : [];
  const ordered = [...list].reverse();

  for (const item of ordered) {
    if (!item || typeof item !== 'object') continue;

    // Security: never read item.key from caller — only HMAC ref.
    if (!item.ref || !resolveBind) continue;
    let key;
    try {
      key = resolveRef(item.ref, resolveBind);
    } catch {
      continue;
    }

    const name = sanitizeDisplayName(item.displayName || item.name || path.basename(key));
    const mime = mimeFromKey(key) || item.mime || null;
    const isImage = typeFromKey(key) === 'image';

    if (isImage) {
      if (isLatestTurn && imagesUsed < MAX_IMAGES_LATEST_TURN) {
        const data = await readFileBase64(key);
        if (data) {
          parts.unshift({ inline_data: { mime_type: mime || 'image/jpeg', data } });
          imagesUsed += 1;
        } else {
          parts.unshift({ text: `[Ảnh đã gửi: ${name}]` });
        }
      } else {
        parts.unshift({ text: `[Ảnh đã gửi: ${name}]` });
      }
      continue;
    }

    if (budget <= 0) {
      parts.unshift({ text: `[Tệp đã gửi: ${name} — đã cắt do giới hạn độ dài]` });
      continue;
    }

    let text = await readSidecarText(key);
    if (text.length > budget) {
      text = text.slice(0, budget);
    }
    budget -= text.length;
    budgetUsed += text.length;
    const body = text
      ? `[Nội dung tệp "${name}"]\n${text}`
      : `[Tệp đã gửi: ${name} — không đọc được nội dung]`;
    parts.unshift({ text: body });
  }

  return { parts, budgetUsed };
}

/**
 * Collect attachments from history turns + current turn, build parts with budget.
 * Docs: newest-first budget. Images: only latest turn as inline_data (max 2).
 */
export async function buildAiPartsFromHistory({
  history = [],
  currentAttachments = [],
  resolveBind = null,
  budgetChars = TEXT_BUDGET_CHARS,
} = {}) {
  const parts = [];

  const olderDocs = [];
  const olderImages = [];
  for (const msg of history) {
    for (const att of msg?.attachments || []) {
      if (!att?.ref) continue;
      const isImage = att.type === 'image' || att.type === 'photo' || String(att.mime || '').startsWith('image/');
      if (isImage) olderImages.push(att);
      else olderDocs.push(att);
    }
  }

  const currentDocs = [];
  const currentImages = [];
  for (const att of currentAttachments || []) {
    if (!att?.ref) continue;
    const isImage = att.type === 'image' || att.type === 'photo' || String(att.mime || '').startsWith('image/');
    if (isImage) currentImages.push(att);
    else currentDocs.push(att);
  }

  // Cap current-turn file count (path that skips enrichAttachmentsForStorage)
  const currentAll = [...currentDocs, ...currentImages];
  if (currentAll.length > MAX_FILES_PER_MESSAGE) {
    const err = new Error(`Tối đa ${MAX_FILES_PER_MESSAGE} tệp mỗi tin nhắn`);
    err.status = 400;
    throw err;
  }

  // Docs: allocate budget to newest first, then emit oldest→newest
  const allDocsNewestFirst = [...olderDocs, ...currentDocs].reverse();
  const rebuilt = [];
  let rem = budgetChars;
  for (const att of allDocsNewestFirst) {
    const { parts: built, budgetUsed } = await buildAiParts({
      attachments: [att],
      budgetChars: rem,
      isLatestTurn: false,
      resolveBind,
    });
    rebuilt.push(...built);
    rem = Math.max(0, rem - budgetUsed);
  }
  parts.push(...rebuilt.reverse());

  // Older images → placeholders (no disk read)
  for (const att of olderImages) {
    const label = sanitizeDisplayName(att.displayName || att.name || 'image');
    parts.push({ text: `[Ảnh đã gửi: ${label}]` });
  }

  // Latest images → inline (max 2)
  let imagesUsed = 0;
  for (const att of currentImages) {
    if (imagesUsed >= MAX_IMAGES_LATEST_TURN) {
      parts.push({ text: `[Ảnh đã gửi: ${sanitizeDisplayName(att.displayName || att.name || 'image')}]` });
      continue;
    }
    const { parts: built } = await buildAiParts({
      attachments: [att],
      budgetChars: 0,
      isLatestTurn: true,
      resolveBind,
    });
    for (const p of built) {
      if (p.inline_data) imagesUsed += 1;
      parts.push(p);
    }
  }

  return parts;
}


const chatAttachmentService = {
  validateFile,
  persistChatBlob,
  storeChatFile,
  promoteAssistantTempFile,
  insertChatAttachmentRow,
  resolveRef,
  signRef,
  enrichAttachmentsForStorage,
  presentAttachmentsForClient,
  buildAiParts,
  buildAiPartsFromHistory,
  MAX_FILES_PER_MESSAGE,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  TEXT_PER_FILE_CHARS,
  TEXT_BUDGET_CHARS,
  CHAT_ATTACHMENT_SOURCES,
};

export default chatAttachmentService;
