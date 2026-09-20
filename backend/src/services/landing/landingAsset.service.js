import crypto from 'crypto';
import uploadController from '../../controllers/upload.controller.js';
import * as fileParserUtil from '../../utils/fileParser.util.js';

const {
  extractTextFromBuffer,
  PDF_INLINE_MAX_BYTES = 10 * 1024 * 1024,
  PDF_INLINE_BUDGET_BYTES = 15 * 1024 * 1024,
} = fileParserUtil;
import { validateFile } from '../chatbot/chatAttachment.service.js';
import { getStorageBackend } from '../storage/storageBackend.js';
import { registerWrittenStorageObject } from '../storage/storageObject.service.js';
import { StorageQuotaExceededError } from '../storage/storageQuota.service.js';
import { activateLandingAssetStorageObjects } from '../../repositories/storage.repository.js';
import db from '../../config/database.js';

export const MAX_IMAGE_LANDING_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
export const TEXT_PER_FILE_CHARS = 8000;
export const TEXT_BUDGET_CHARS = 12000;
export const PDF_MAX_PAGES = 30;
export const PARSE_TIMEOUT_MS = 20_000;
export const HEIC_CONVERT_TIMEOUT_MS = 20_000;
export const LANDING_ASSET_TEMP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

/**
 * Tạo URL công khai cho landing asset
 */
export function buildLandingAssetUrl(storageKey) {
  const base = uploadController.getPublicBaseUrlFromEnv();
  const cleanKey = String(storageKey || '').replace(/^\/+/, '');
  return `${base}/lp-assets/${cleanKey}`;
}

/**
 * Chuyển đổi ảnh HEIC sang JPEG có timeout 20s.
 *
 * `heic-convert` kéo theo `libheif-js` (wasm) — nạp LƯỜI, chỉ khi thật sự có ảnh HEIC:
 * import ở đầu file làm mọi tiến trình nạp module này phải dựng wasm (đo 16/09: +32 MB RSS mỗi
 * lần nạp), và trong một lượt `jest --runInBand` thì 75 suite integration cùng trả giá đó → heap
 * phình tới 3,8 GB rồi chết. Backend production cũng không phải gánh wasm lúc khởi động.
 */
async function convertHeicWithTimeout(buffer, timeoutMs = HEIC_CONVERT_TIMEOUT_MS) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Quá thời gian chuyển đổi ảnh HEIC (20s)')), timeoutMs);
  });
  try {
    const { default: convertHeic } = await import('heic-convert');
    const res = await Promise.race([
      convertHeic({
        buffer,
        format: 'JPEG',
        quality: 0.85,
      }),
      timeoutPromise,
    ]);
    return Buffer.isBuffer(res) ? res : Buffer.from(res);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Trích xuất text tài liệu với timeout an toàn
 */
async function extractDocWithTimeout(buffer, originalName, mime) {
  const parsePromise = extractTextFromBuffer(buffer, originalName, mime, { max: PDF_MAX_PAGES });
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

/**
 * Ingest danh sách files đính kèm của landing page (ảnh hoặc tài liệu).
 * Ảnh: validate, lưu storage, ghi ledger (category='landing_asset', state='temp'/'active').
 * Tài liệu: trích xuất text (không lưu kho).
 *
 * @param {object} params
 * @param {Array<object>} params.files - Mảng { tempId, storageKey, originalName, contentType, size }
 * @param {number|string} params.ownerUserId
 * @param {number|string} [params.actorUserId]
 * @param {number|string|null} [params.landingPageId]
 * @param {string} [params.profile='landing']
 * @param {boolean} [params.imagesOnly=false] - Nút "Tải ảnh" ở Cài đặt trang: tài liệu bị từ chối
 *   ngay với lý do đọc được, không phí công trích xuất chữ rồi mới báo lỗi ở controller.
 * @returns {Promise<{ assets: Array<object>, documents: Array<object>, skipped: Array<object> }>}
 */
export async function ingestLandingAttachments({
  files = [],
  ownerUserId,
  actorUserId = null,
  landingPageId = null,
  profile = 'landing',
  imagesOnly = false,
}) {
  const ownerId = Number(ownerUserId);
  if (!ownerId) {
    throw new Error('ownerUserId là bắt buộc');
  }

  const assets = [];
  const documents = [];
  const skipped = [];
  let totalDocChars = 0;
  let totalInlinePdfBytes = 0;

  for (const file of files) {
    if (!file) continue;
    const fileName = file.originalName || file.tempId || file.storageKey || 'đính kèm';

    try {
      let buffer = null;

      try {
        if (file.tempId) {
          buffer = await uploadController.readTempFileBuffer(file.tempId, file.originalName);
        } else if (file.storageKey) {
          const keyStr = String(file.storageKey).trim();
          const expectedPrefix = `uploads/${ownerId}/`;
          if (!keyStr.startsWith(expectedPrefix)) {
            const err = new Error('Không có quyền truy cập file lưu trữ này');
            err.status = 403;
            throw err;
          }
          buffer = await uploadController.readFileBufferByKey(keyStr);
        }
      } catch (readErr) {
        if (readErr.status === 403) throw readErr;
        const notFoundErr = new Error(`Tệp "${fileName}" đã hết hạn hoặc không còn, hãy đính kèm lại.`);
        notFoundErr.status = 400;
        throw notFoundErr;
      }

      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        const notFoundErr = new Error(`Tệp "${fileName}" đã hết hạn hoặc không còn, hãy đính kèm lại.`);
        notFoundErr.status = 400;
        throw notFoundErr;
      }

      // Validate mime, extension, magic bytes với profile được chọn
      const validation = validateFile({
        buffer,
        originalName: file.originalName,
        mimetype: file.contentType,
        profile,
      });

      if (validation.kind === 'image') {
        // Nếu là HEIC/HEIF: chuyển sang JPEG trước khi kiểm dung lượng và lưu
        if (validation.mime === 'image/heic') {
          try {
            buffer = await convertHeicWithTimeout(buffer);
            validation.mime = 'image/jpeg';
            validation.ext = '.jpg';
          } catch (convErr) {
            throw new Error(`Không thể chuyển đổi ảnh HEIC: ${convErr.message}`);
          }
        }

        if (buffer.length > MAX_IMAGE_LANDING_BYTES) {
          const err = new Error('Ảnh đính kèm vượt dung lượng tối đa 10 MB');
          err.status = 400;
          throw err;
        }

        const safeBase = uploadController.sanitizeFileBaseName(file.originalName);
        const ext = validation.ext || '.png';
        const key = `uploads/${ownerId}/landing/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}${ext}`;

        // Lưu file vào storage và ghi ledger
        try {
          await getStorageBackend().put(key, buffer, { contentType: validation.mime });
          await registerWrittenStorageObject({
            ownerUserId: ownerId,
            actorUserId: actorUserId ? Number(actorUserId) : ownerId,
            storageKey: key,
            category: 'landing_asset',
            state: landingPageId ? 'active' : 'temp',
            sizeBytes: buffer.length,
            expiresAt: landingPageId ? null : new Date(Date.now() + LANDING_ASSET_TEMP_TTL_MS),
            referenceType: landingPageId ? 'landing_page' : 'landing_asset_draft',
            referenceId: landingPageId ? String(landingPageId) : null,
          });
        } catch (storageErr) {
          // Đánh dấu TRƯỚC khi dọn rác: nếu delete() cũng hỏng, lỗi gốc mới là thứ phải báo —
          // không được để nó rơi xuống nhánh "bỏ qua tệp" và biến sự cố kho thành im lặng.
          storageErr.isSystemError = true;
          try {
            await getStorageBackend().delete(key);
          } catch {
            // Bỏ qua: rác sẽ do dọn kho định kỳ xử lý.
          }
          throw storageErr;
        }

        const url = buildLandingAssetUrl(key);
        // GIF không inline cho AI model
        const isGif = validation.mime === 'image/gif';
        const inlineForModel = !isGif && buffer.length <= MAX_INLINE_IMAGE_BYTES;

        assets.push({
          url,
          storageKey: key,
          originalName: file.originalName || safeBase,
          contentType: validation.mime,
          sizeBytes: buffer.length,
          inlineForModel,
          base64: inlineForModel ? buffer.toString('base64') : null,
        });
      } else if (validation.kind === 'doc') {
        if (imagesOnly) {
          skipped.push({
            originalName: file.originalName || fileName,
            reason: 'Chỉ nhận ảnh PNG/JPG/WebP/GIF/HEIC',
          });
          continue;
        }
        if (totalDocChars >= TEXT_BUDGET_CHARS) {
          skipped.push({
            originalName: file.originalName || fileName,
            reason: 'Đã đủ 12.000 ký tự tài liệu, tệp này không được đọc',
          });
          continue;
        }

        let text = '';
        try {
          text = await extractDocWithTimeout(buffer, file.originalName, validation.mime);
        } catch (extractErr) {
          throw new Error(`Trích xuất tài liệu thất bại: ${extractErr.message}`);
        }

        const remainingBudget = TEXT_BUDGET_CHARS - totalDocChars;
        const fileLimit = Math.min(TEXT_PER_FILE_CHARS, remainingBudget);
        const trimmed = String(text || '').trim().slice(0, fileLimit);

        if (!trimmed) {
          if (validation.mime === 'application/pdf') {
            if (
              buffer.length <= PDF_INLINE_MAX_BYTES &&
              totalInlinePdfBytes + buffer.length <= PDF_INLINE_BUDGET_BYTES
            ) {
              documents.push({
                originalName: file.originalName || 'Tài liệu',
                text: '',
                inlinePdf: true,
                contentType: 'application/pdf',
                sizeBytes: buffer.length,
                base64: buffer.toString('base64'),
              });
              totalInlinePdfBytes += buffer.length;
              continue;
            } else if (buffer.length > PDF_INLINE_MAX_BYTES) {
              const sizeMb = Math.round(buffer.length / (1024 * 1024));
              skipped.push({
                originalName: file.originalName || fileName,
                reason: `PDF dạng ảnh (scan) nặng ${sizeMb} MB, vượt giới hạn 10 MB — hãy nén hoặc tách nhỏ`,
              });
              continue;
            } else {
              skipped.push({
                originalName: file.originalName || fileName,
                reason: 'Đã đủ 15 MB PDF dạng ảnh, tệp này không được đọc',
              });
              continue;
            }
          }

          skipped.push({
            originalName: file.originalName || fileName,
            reason: 'Không đọc được chữ trong tệp (có thể là bản scan)',
          });
          continue;
        }

        totalDocChars += trimmed.length;
        documents.push({
          originalName: file.originalName || 'Tài liệu',
          text: trimmed,
        });
      }
    } catch (fileErr) {
      // Lỗi hệ thống: 403 (sai chủ), Quota, hoặc Storage/Ledger -> NÉM NGAY
      if (
        fileErr.status === 403 ||
        fileErr instanceof StorageQuotaExceededError ||
        fileErr?.code === 'STORAGE_QUOTA_EXCEEDED' ||
        fileErr.isSystemError
      ) {
        throw fileErr;
      }

      skipped.push({
        originalName: file.originalName || fileName,
        reason: fileErr.message || 'Tệp lỗi hoặc không được hỗ trợ',
      });
    }
  }

  // Nếu người dùng có gửi tệp mà không tệp nào dùng được -> Ném 400
  if (files.length > 0 && assets.length === 0 && documents.length === 0) {
    const details = skipped.map((s) => `${s.originalName} — ${s.reason}`).join('; ');
    const err = new Error(`Không dùng được tệp đính kèm: ${details}`);
    err.status = 400;
    throw err;
  }

  return { assets, documents, skipped };
}

/**
 * Quét các URL landing asset trong HTML và kích hoạt ledger storage object
 * (chuyển state sang 'active', expires_at = null, gắn reference_id = landingPageId).
 */
export async function linkAssetsToLandingPage({
  html,
  ownerUserId,
  landingPageId,
  client = null,
}) {
  const rawHtml = String(html || '');
  const ownerId = Number(ownerUserId);
  if (!rawHtml || !ownerId || !landingPageId) {
    return [];
  }

  const assetRegex = /\/lp-assets\/(uploads\/(\d+)\/landing\/[A-Za-z0-9._-]+)/g;
  const storageKeys = new Set();
  let match;
  while ((match = assetRegex.exec(rawHtml)) !== null) {
    const key = match[1];
    const keyOwner = Number(match[2]);
    if (keyOwner === ownerId) {
      storageKeys.add(key);
    }
  }

  if (storageKeys.size === 0) {
    return [];
  }

  const queryable = client || db;
  return activateLandingAssetStorageObjects(
    {
      storageKeys: Array.from(storageKeys),
      ownerUserId: ownerId,
      landingPageId,
    },
    queryable
  );
}

export default {
  MAX_IMAGE_LANDING_BYTES,
  MAX_INLINE_IMAGE_BYTES,
  TEXT_PER_FILE_CHARS,
  TEXT_BUDGET_CHARS,
  PDF_MAX_PAGES,
  PARSE_TIMEOUT_MS,
  LANDING_ASSET_TEMP_TTL_MS,
  buildLandingAssetUrl,
  ingestLandingAttachments,
  linkAssetsToLandingPage,
};
