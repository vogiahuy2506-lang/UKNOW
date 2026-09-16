import crypto from 'crypto';
import uploadController from '../../controllers/upload.controller.js';
import { validateFile } from '../chatbot/chatAttachment.service.js';
import { getStorageBackend } from '../storage/storageBackend.js';
import { registerWrittenStorageObject } from '../storage/storageObject.service.js';

/**
 * Trần dung lượng riêng cho tệp đính kèm Gửi nhanh — nhỏ hơn nhiều so với trần chung
 * MAX_UPLOAD_FILE_BYTES (100MB): hộp thư người nhận thường chặn thư quá 25MB kể cả khi hệ
 * thống backend cho phép tải lên tới 100MB.
 */
export const MAX_QUICK_SEND_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB

/** Tệp chưa gắn vào lượt gửi nào — tự hết hạn nếu người dùng soạn dở rồi bỏ. */
export const QUICK_SEND_ATTACHMENT_TEMP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

/**
 * Đưa một tệp tạm (đã tải qua `/uploads/temp`) vào storage lâu dài cho Gửi nhanh, ở trạng thái
 * `temp` (không phải `active` vĩnh viễn — tệp dùng một lần, tự dọn theo `storageReconcile.service.js`
 * nếu không được tham chiếu trong tin nhắn thật sự gửi đi).
 *
 * @param {object} params
 * @param {string} params.tempId
 * @param {string} params.originalName
 * @param {string} [params.contentType]
 * @param {number} [params.size]
 * @param {number|string} params.ownerUserId chủ workspace — bắt buộc, quyết định tiền tố key `uploads/<ownerUserId>/...`
 * @param {number|string} [params.actorUserId] người thao tác thật (nhân viên) — mặc định = ownerUserId
 * @returns {Promise<{ key: string, originalName: string, size: number, contentType: string }>}
 */
export async function ingestQuickSendAttachment({
  tempId,
  originalName,
  contentType,
  size,
  ownerUserId,
  actorUserId = null,
}) {
  const ownerId = Number(ownerUserId);
  if (!ownerId) {
    throw new Error('ownerUserId là bắt buộc');
  }

  const fileName = originalName || tempId || 'đính kèm';

  let buffer = null;
  try {
    buffer = await uploadController.readTempFileBuffer(tempId, originalName);
  } catch {
    const err = new Error(`Tệp "${fileName}" đã hết hạn hoặc không còn, hãy đính kèm lại.`);
    err.status = 400;
    throw err;
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error(`Tệp "${fileName}" đã hết hạn hoặc không còn, hãy đính kèm lại.`);
    err.status = 400;
    throw err;
  }

  // Định dạng mặc định (không truyền profile) — đúng danh sách PDF/DOCX/PPTX/XLSX/TXT/CSV/
  // PNG/JPEG/WEBP; KHÔNG dùng profile 'landing' (HEIC/GIF/DOC/XLS ngoài phạm vi Gửi nhanh).
  const validation = validateFile({ buffer, originalName, mimetype: contentType });

  if (buffer.length > MAX_QUICK_SEND_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_QUICK_SEND_ATTACHMENT_BYTES / (1024 * 1024));
    const err = new Error(`Tệp vượt dung lượng tối đa ${mb} MB`);
    err.status = 400;
    throw err;
  }

  const safeBase = uploadController.sanitizeFileBaseName(originalName);
  const key = `uploads/${ownerId}/quick-send/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}${validation.ext}`;

  try {
    await getStorageBackend().put(key, buffer, { contentType: validation.mime });
    await registerWrittenStorageObject({
      ownerUserId: ownerId,
      actorUserId: actorUserId ? Number(actorUserId) : ownerId,
      storageKey: key,
      category: 'quick_send',
      state: 'temp',
      sizeBytes: buffer.length,
      expiresAt: new Date(Date.now() + QUICK_SEND_ATTACHMENT_TEMP_TTL_MS),
      referenceType: 'quick_send_attachment',
    });
  } catch (storageErr) {
    await getStorageBackend().delete(key).catch(() => {});
    throw storageErr;
  }

  return {
    key,
    originalName: originalName || safeBase,
    size: buffer.length,
    contentType: validation.mime,
  };
}

export default {
  MAX_QUICK_SEND_ATTACHMENT_BYTES,
  QUICK_SEND_ATTACHMENT_TEMP_TTL_MS,
  ingestQuickSendAttachment,
};
