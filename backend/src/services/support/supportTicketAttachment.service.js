import crypto from 'crypto';
import path from 'path';
import { validateFile } from '../chatbot/chatAttachment.service.js';
import { getStorageBackend } from '../storage/storageBackend.js';
import { registerWrittenStorageObject } from '../storage/storageObject.service.js';
import { resolveWorkspaceOwnerId } from '../storage/storageQuota.service.js';
import { activateSupportTicketStorageObjects } from '../../repositories/storage.repository.js';

/**
 * Ảnh đính kèm ticket hỗ trợ (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-4).
 *
 * Luồng hai bước: (1) `uploadSupportAttachment` ghi ảnh vào kho ở trạng thái `temp` (hết hạn sau 24 giờ nếu không gắn vào tin nào);
 * (2) khi tạo ticket / gửi tin, `claimAttachments` chuyển `temp` → `active` + tham chiếu `support_ticket` trong CÙNG giao dịch
 * với việc chèn tin. Dung lượng tính cho CHỦ workspace (`ownerUserId`), người thao tác thật ghi ở `actorUserId` — cùng cách
 * quickSendAttachment làm.
 */

export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const SUPPORT_ATTACHMENT_MAX_PER_MESSAGE = 3;
export const SUPPORT_ATTACHMENT_TEMP_TTL_MS = 24 * 60 * 60 * 1000; // 24 giờ
export const SUPPORT_ATTACHMENT_CATEGORY = 'support_ticket';

/** Chỉ ảnh raster phổ biến. validateFile kiểm nội dung (magic bytes) rồi mới đối chiếu danh sách này. */
export const SUPPORT_ATTACHMENT_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MIME_BY_EXTENSION = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
});
const BASE_NAME_MAX = 60;

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

/** Bỏ dấu tiếng Việt rồi chỉ giữ [A-Za-z0-9-_] — tên nằm trong khoá kho nên phải an toàn. */
function sanitizeBaseName(fileName) {
  const ext = path.extname(String(fileName || ''));
  const base = path.basename(String(fileName || ''), ext)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim();
  const safe = (base || 'anh').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, BASE_NAME_MAX);
  return safe || 'anh';
}

/**
 * Tên hiển thị suy từ khoá kho `uploads/<owner>/support/<ts>_<rand8>_<base>.<ext>` — server tự suy, KHÔNG tin tên client gửi lại
 * lúc gắn vào tin.
 */
export function displayNameFromStorageKey(storageKey) {
  const fileName = path.basename(String(storageKey || ''));
  const stripped = fileName.replace(/^\d+_[0-9a-f]{8}_/, '');
  return stripped || fileName || 'anh';
}

export function mimeFromStorageKey(storageKey) {
  return MIME_BY_EXTENSION[path.extname(String(storageKey || '')).toLowerCase()] || 'application/octet-stream';
}

/**
 * Chuẩn hoá danh sách id tệp client gửi lên: mảng số nguyên dương không trùng, tối đa 3.
 *
 * @param {unknown} raw
 * @returns {number[]}
 */
export function normalizeAttachmentIds(raw) {
  if (raw == null || raw === '') return [];
  if (!Array.isArray(raw)) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_INVALID', 'Danh sách ảnh đính kèm không hợp lệ');
  }
  const ids = [];
  for (const item of raw) {
    const text = String(item ?? '').trim();
    if (!/^\d{1,18}$/.test(text) || Number(text) <= 0) {
      throw httpError(400, 'SUPPORT_ATTACHMENT_INVALID', 'Ảnh đính kèm không hợp lệ');
    }
    ids.push(Number(text));
  }
  if (new Set(ids).size !== ids.length) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_INVALID', 'Ảnh đính kèm bị trùng');
  }
  if (ids.length > SUPPORT_ATTACHMENT_MAX_PER_MESSAGE) {
    throw httpError(
      400,
      'SUPPORT_ATTACHMENT_LIMIT',
      `Mỗi tin chỉ đính kèm tối đa ${SUPPORT_ATTACHMENT_MAX_PER_MESSAGE} ảnh`
    );
  }
  return ids;
}

/**
 * Tải MỘT ảnh lên kho (trạng thái `temp`, hết hạn sau 24 giờ).
 *
 * @param {object} params
 * @param {{ buffer: Buffer, originalname?: string, mimetype?: string }} params.file tệp từ multer memoryStorage
 * @param {object} params.user `req.user` (có `id`, `activeContext`)
 * @returns {Promise<{ storageObjectId: number, key: string, name: string, size: number, mime: string, expiresAt: Date }>}
 */
export async function uploadSupportAttachment({ file, user }) {
  const buffer = file?.buffer;
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_REQUIRED', 'Chưa chọn ảnh để đính kèm');
  }
  const originalName = String(file.originalname || '');
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_TYPE_INVALID', 'Chỉ nhận ảnh PNG, JPEG, WEBP hoặc GIF');
  }
  if (buffer.length > SUPPORT_ATTACHMENT_MAX_BYTES) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_TOO_LARGE', 'Mỗi ảnh tối đa 5 MB');
  }

  // profile 'landing' mới nhận GIF; sau đó siết lại về đúng 4 loại ảnh (HEIC, tài liệu... bị loại ở đây).
  let validation;
  try {
    validation = validateFile({ buffer, originalName, mimetype: file.mimetype, profile: 'landing' });
  } catch (error) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_TYPE_INVALID', error?.message || 'Ảnh không hợp lệ');
  }
  if (validation.kind !== 'image' || !SUPPORT_ATTACHMENT_MIMES.includes(validation.mime)) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_TYPE_INVALID', 'Chỉ nhận ảnh PNG, JPEG, WEBP hoặc GIF');
  }

  const ownerId = resolveWorkspaceOwnerId(user);
  const key = `uploads/${ownerId}/support/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${sanitizeBaseName(originalName)}${validation.ext}`;
  const expiresAt = new Date(Date.now() + SUPPORT_ATTACHMENT_TEMP_TTL_MS);

  let object;
  try {
    await getStorageBackend().put(key, buffer, { contentType: validation.mime });
    object = await registerWrittenStorageObject({
      ownerUserId: ownerId,
      actorUserId: Number(user.id),
      storageKey: key,
      category: SUPPORT_ATTACHMENT_CATEGORY,
      state: 'temp',
      sizeBytes: buffer.length,
      expiresAt,
    });
  } catch (storageError) {
    await getStorageBackend().delete(key).catch(() => {});
    throw storageError;
  }

  return {
    storageObjectId: Number(object.id),
    key,
    name: displayNameFromStorageKey(key),
    size: buffer.length,
    mime: validation.mime,
    expiresAt,
  };
}

/**
 * Gắn các tệp tạm vào một ticket: `temp` → `active` + `reference_type='support_ticket'`. Phải gọi TRONG giao dịch `client` của việc
 * chèn tin. Một id nào đó không thoả (không phải của mình / không phải tệp ticket / đã gắn / hết hạn) → 400, cả lô bị từ chối.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ objectIds: number[], actorUserId: number, ticketId: number|string }} params
 * @returns {Promise<Array<{ storageObjectId: number, key: string, name: string, size: number, mime: string }>>} giá trị cho cột `attachments`
 */
export async function claimAttachments(client, { objectIds, actorUserId, ticketId }) {
  if (!objectIds.length) return [];
  const rows = await activateSupportTicketStorageObjects({ objectIds, actorUserId, ticketId }, client);
  if (rows.length !== objectIds.length) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_INVALID', 'Có ảnh đính kèm không hợp lệ hoặc đã hết hạn, hãy tải lại ảnh');
  }
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  // Giữ đúng thứ tự client gửi lên.
  return objectIds.map((id) => {
    const row = byId.get(id);
    return {
      storageObjectId: id,
      key: row.storage_key,
      name: displayNameFromStorageKey(row.storage_key),
      size: Number(row.size_bytes),
      mime: mimeFromStorageKey(row.storage_key),
    };
  });
}

/** Dạng gửi ra API: bỏ `key` (khoá kho) — client chỉ cần id để gọi endpoint phát tệp. */
export function toAttachmentDto(attachment) {
  return {
    storageObjectId: Number(attachment.storageObjectId),
    name: attachment.name,
    size: Number(attachment.size) || 0,
    mime: attachment.mime,
  };
}

export default {
  uploadSupportAttachment,
  claimAttachments,
  normalizeAttachmentIds,
  toAttachmentDto,
  displayNameFromStorageKey,
  mimeFromStorageKey,
};
