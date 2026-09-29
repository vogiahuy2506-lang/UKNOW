/**
 * P5 buoc 5 (PLAN_TG_WA_DAY_DU) - nhan anh/tep KHACH GUI toi Telegram/WhatsApp (chieu vao).
 *
 * Truoc day tin khong chu (anh/tep khong caption) bi BO IM LANG. Gio: tai byte ve, luu vao kho chat cua CHU workspace
 * (`uploads/<chu>/chat/…`, qua `persistChatBlob` — co so dang ky kho, han muc dung luong, catalog, don dep het han), ghi
 * `channel_messages.attachments = [{ key, displayName, size, mime, type }]` (cung dang Hop thu da render cho tep gui di).
 * Noi dung text = caption, khong co thi cho giu cho "[Hình ảnh]" / "[Tệp]" — AI CHI thay chu (khuon Zalo).
 *
 * Khong bao gio nem: tep khong luu duoc (qua 20 MB, dinh dang la, het dung luong, loi tai) -> `{ attachment: null,
 * skipReason }`; tin van vao Hop thu voi cho giu cho kem ly do, khong mat tin cua khach.
 */
import {
  CHAT_ATTACHMENT_SOURCES,
  persistChatBlob,
  presentAttachmentsForClient,
  promoteChatAttachments,
} from './chatAttachment.service.js';
import { StorageQuotaExceededError } from '../storage/storageQuota.service.js';

/** Tran dung luong MOT tep khach gui ma ta con luu (lon hon: bo qua, ghi ly do). */
export const INBOUND_MEDIA_MAX_BYTES = 20 * 1024 * 1024;

export const INBOUND_MEDIA_PLACEHOLDERS = Object.freeze({
  image: '[Hình ảnh]',
  file: '[Tệp]',
});

const SKIP_REASON_LABELS = Object.freeze({
  too_large: 'quá 20 MB, không lưu',
  unsupported: 'định dạng không hỗ trợ, không lưu',
  quota: 'hết dung lượng lưu trữ, không lưu',
  error: 'không tải được',
});

const DEFAULT_EXTENSION_BY_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

/**
 * Noi dung text cua tin chua anh/tep: caption neu co, khong thi cho giu cho (kem ly do khi khong luu duoc).
 * @param {{ caption?: string|null, kind?: 'image'|'file', skipReason?: string|null }} input
 */
export function buildInboundMediaContent({ caption, kind = 'file', skipReason = null }) {
  const text = String(caption ?? '').trim();
  if (text) return text;
  const base = INBOUND_MEDIA_PLACEHOLDERS[kind] || INBOUND_MEDIA_PLACEHOLDERS.file;
  return skipReason ? `${base} (${SKIP_REASON_LABELS[skipReason] || SKIP_REASON_LABELS.error})` : base;
}

/** Ten tep khi nen tang khong cung cap (anh Telegram/WhatsApp khong co ten). */
export function defaultInboundFileName(kind, mimeType) {
  const ext = DEFAULT_EXTENSION_BY_MIME[String(mimeType || '').toLowerCase()] || (kind === 'image' ? 'jpg' : 'bin');
  return `${kind === 'image' ? 'hinh-anh' : 'tep'}.${ext}`;
}

function classifyStoreError(err) {
  if (err instanceof StorageQuotaExceededError || err?.code === 'STORAGE_QUOTA_EXCEEDED') return 'quota';
  // validateFile (chatAttachment.service) nem httpError status 400 cho dinh dang/noi dung khong hop le.
  if (err?.status === 400) return 'unsupported';
  return 'error';
}

/**
 * Luu MOT tep khach gui vao kho chat cua chu workspace.
 *
 * @param {object} input
 * @param {number|string} input.ownerUserId chu workspace (KHONG phai nhan vien)
 * @param {Buffer|null} input.buffer
 * @param {string|null} [input.fileName]
 * @param {string|null} [input.mimeType]
 * @param {'image'|'file'} input.kind
 * @returns {Promise<{ attachment: {key: string, displayName: string, size: number, mime: string, type: string}|null, skipReason: string|null }>}
 */
export async function storeInboundMedia({ ownerUserId, buffer, fileName = null, mimeType = null, kind = 'file' }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { attachment: null, skipReason: 'error' };
  }
  if (buffer.length > INBOUND_MEDIA_MAX_BYTES) {
    return { attachment: null, skipReason: 'too_large' };
  }
  try {
    const persisted = await persistChatBlob({
      buffer,
      originalName: fileName || defaultInboundFileName(kind, mimeType),
      mimetype: mimeType || undefined,
      ownerUserId,
      // Nhan 'inbox_outbound' la nhan DUY NHAT ma CHECK cua chat_attachments.source cho phep cho Hop thu (khong them migration).
      source: CHAT_ATTACHMENT_SOURCES.INBOX_OUTBOUND,
    });
    return {
      attachment: {
        key: persisted._key,
        displayName: persisted.displayName,
        size: persisted.size,
        mime: persisted.mime,
        type: persisted.type,
      },
      skipReason: null,
    };
  } catch (err) {
    const skipReason = classifyStoreError(err);
    // Khong log noi dung/ten tep — chi ly do.
    console.warn(`[ChannelInboundMedia] khong luu duoc tep khach gui (${skipReason}): ${err?.message || 'unknown'}`);
    return { attachment: null, skipReason };
  }
}

/**
 * Sau khi dong tin da ghi vao channel_messages: doi tep tu 'temp' (het han sau 24h) sang 'active' (90 ngay).
 * Thieu buoc nay thi anh trong Hop thu mat sau mot ngay. Best-effort, khong nem.
 */
export async function promoteInboundAttachments(attachments) {
  const list = Array.isArray(attachments) ? attachments.filter((a) => a?.key) : [];
  if (list.length === 0) return;
  try {
    await promoteChatAttachments(list.map((a) => ({ key: a.key })));
  } catch (err) {
    console.warn('[ChannelInboundMedia] promote failed:', err?.message);
  }
}

/** Dang gui cho client (SSE): url tai ve ky san, KHONG lo khoa luu tru (giong `presentInboxAttachments` cua Hop thu). */
export function presentInboundAttachments(attachments) {
  return presentAttachmentsForClient(Array.isArray(attachments) ? attachments : [], { includeRef: false });
}

export default {
  INBOUND_MEDIA_MAX_BYTES,
  INBOUND_MEDIA_PLACEHOLDERS,
  buildInboundMediaContent,
  defaultInboundFileName,
  storeInboundMedia,
  promoteInboundAttachments,
  presentInboundAttachments,
};
