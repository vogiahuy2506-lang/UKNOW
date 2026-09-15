import crypto from 'crypto';
import uploadController from '../controllers/upload.controller.js';
import { validateFile } from './chatbot/chatAttachment.service.js';
import { getStorageBackend } from './storage/storageBackend.js';
import { registerWrittenStorageObject } from './storage/storageObject.service.js';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4a mục 2 — bản chỉ-ảnh của
 * `ingestLandingAttachments` (`services/landing/landingAsset.service.js:55-150`). Không tái
 * dùng thẳng hàm đó: nó còn nhánh tài liệu (PDF/DOCX/...) trích văn bản + base64 cho AI mà biểu
 * mẫu không cần — chép lại đúng NHÁNH ẢNH (validate, trần 10MB, ghi kho, ghi sổ
 * `registerWrittenStorageObject` state 'temp', lỗi sổ thì xoá file) để không kéo theo hành vi
 * không liên quan, và để không ai lỡ sửa nhánh chung làm lệch cả hai luồng landing/form.
 */
export const MAX_IMAGE_FORM_BYTES = 10 * 1024 * 1024; // 10 MB, khớp landing
export const FORM_ASSET_TEMP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày, khớp landing

/**
 * URL công khai cho ảnh biểu mẫu — phục vụ qua `/lp-assets/<khoá>` (landingAsset.controller.js
 * mở rộng thêm cặp `forms/` ↔ `form_asset`, KHÔNG mở route gốc mới vì nginx production chỉ proxy
 * `^/(file|download|track|lp-assets)/` về backend, route khác rơi vào SPA — Bẫy production PR-4a).
 *
 * @param {string} storageKey
 * @returns {string}
 */
export function buildFormAssetUrl(storageKey) {
  const base = uploadController.getPublicBaseUrlFromEnv();
  const cleanKey = String(storageKey || '').replace(/^\/+/, '');
  return `${base}/lp-assets/${cleanKey}`;
}

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Ingest MỘT ảnh banner/logo biểu mẫu từ file tạm (`POST /api/uploads/temp` trước đó) — lưu vào
 * kho dưới `uploads/<chủ>/forms/...`, ghi sổ `storage_objects` category `form_asset` state
 * `temp` (hết hạn 7 ngày, `reference_type 'form_asset_draft'`). Form thật gán khoá này vào
 * `theme.bannerKey`/`logoKey` sau; lúc đó `form.service.js` mới chuyển sổ sang `active` gắn
 * `reference_id` = id form (không làm ở đây, vì lúc upload chưa chắc đã có form để gắn).
 *
 * @param {object} params
 * @param {string} params.tempId
 * @param {string} [params.originalName]
 * @param {string} [params.contentType]
 * @param {number|string} params.ownerUserId
 * @param {number|string} [params.actorUserId]
 * @returns {Promise<{ storageKey: string, url: string, sizeBytes: number, originalName: string, contentType: string }>}
 */
export async function ingestFormAsset({ tempId, originalName, contentType, ownerUserId, actorUserId = null }) {
  const ownerId = Number(ownerUserId);
  if (!ownerId) {
    throw new Error('ownerUserId là bắt buộc');
  }
  if (!tempId) {
    throw httpError('Thiếu tempId tệp tạm');
  }

  const fileName = originalName || tempId;
  let buffer;
  try {
    buffer = await uploadController.readTempFileBuffer(tempId, originalName);
  } catch {
    throw httpError(`Tệp "${fileName}" đã hết hạn hoặc không còn, hãy đính kèm lại.`);
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw httpError(`Tệp "${fileName}" đã hết hạn hoặc không còn, hãy đính kèm lại.`);
  }

  const validation = validateFile({ buffer, originalName, mimetype: contentType });
  if (validation.kind !== 'image') {
    throw httpError('Chỉ nhận ảnh PNG/JPG/WebP');
  }
  if (buffer.length > MAX_IMAGE_FORM_BYTES) {
    throw httpError('Ảnh vượt dung lượng tối đa 10 MB');
  }

  const safeBase = uploadController.sanitizeFileBaseName(originalName);
  const ext = validation.ext || '.png';
  const key = `uploads/${ownerId}/forms/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}${ext}`;

  await getStorageBackend().put(key, buffer, { contentType: validation.mime });

  try {
    await registerWrittenStorageObject({
      ownerUserId: ownerId,
      actorUserId: actorUserId ? Number(actorUserId) : ownerId,
      storageKey: key,
      category: 'form_asset',
      state: 'temp',
      sizeBytes: buffer.length,
      expiresAt: new Date(Date.now() + FORM_ASSET_TEMP_TTL_MS),
      referenceType: 'form_asset_draft',
      referenceId: null,
    });
  } catch (ledgerErr) {
    await getStorageBackend().delete(key).catch(() => {});
    throw ledgerErr;
  }

  return {
    storageKey: key,
    url: buildFormAssetUrl(key),
    sizeBytes: buffer.length,
    originalName: originalName || safeBase,
    contentType: validation.mime,
  };
}

export default {
  MAX_IMAGE_FORM_BYTES,
  FORM_ASSET_TEMP_TTL_MS,
  buildFormAssetUrl,
  ingestFormAsset,
};
