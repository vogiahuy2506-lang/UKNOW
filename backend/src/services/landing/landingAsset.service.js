import crypto from 'crypto';
import uploadController from '../../controllers/upload.controller.js';
import { extractTextFromBuffer } from '../../utils/fileParser.util.js';
import { validateFile } from '../chatbot/chatAttachment.service.js';
import { getStorageBackend } from '../storage/storageBackend.js';
import { registerWrittenStorageObject } from '../storage/storageObject.service.js';
import { activateLandingAssetStorageObjects } from '../../repositories/storage.repository.js';
import db from '../../config/database.js';

export const MAX_IMAGE_LANDING_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
export const TEXT_PER_FILE_CHARS = 8000;
export const TEXT_BUDGET_CHARS = 12000;
export const PDF_MAX_PAGES = 30;
export const PARSE_TIMEOUT_MS = 20_000;
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
 * Trích xuất text tài liệu với timeout an toàn
 */
async function extractDocWithTimeout(buffer, originalName, mime) {
  const parsePromise = extractTextFromBuffer(buffer, originalName, mime, { maxPages: PDF_MAX_PAGES });
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
 * @returns {Promise<{ assets: Array<object>, documents: Array<object> }>}
 */
export async function ingestLandingAttachments({
  files = [],
  ownerUserId,
  actorUserId = null,
  landingPageId = null,
}) {
  const ownerId = Number(ownerUserId);
  if (!ownerId) {
    throw new Error('ownerUserId là bắt buộc');
  }

  const assets = [];
  const documents = [];
  let totalDocChars = 0;

  for (const file of files) {
    if (!file) continue;
    let buffer = null;

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

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      continue;
    }

    // Validate mime, extension, magic bytes (từ chối SVG, GIF, lỗi format...)
    const validation = validateFile({
      buffer,
      originalName: file.originalName,
      mimetype: file.contentType,
    });

    if (validation.kind === 'image') {
      if (buffer.length > MAX_IMAGE_LANDING_BYTES) {
        const err = new Error('Ảnh đính kèm vượt dung lượng tối đa 10 MB');
        err.status = 400;
        throw err;
      }

      const safeBase = uploadController.sanitizeFileBaseName(file.originalName);
      const ext = validation.ext || '.png';
      const key = `uploads/${ownerId}/landing/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeBase}${ext}`;

      // Lưu file vào storage
      await getStorageBackend().put(key, buffer, { contentType: validation.mime });

      // Ghi ledger
      try {
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
      } catch (ledgerErr) {
        await getStorageBackend().delete(key).catch(() => {});
        throw ledgerErr;
      }

      const url = buildLandingAssetUrl(key);
      const inlineForModel = buffer.length <= MAX_INLINE_IMAGE_BYTES;

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
      if (totalDocChars < TEXT_BUDGET_CHARS) {
        let text = '';
        try {
          text = await extractDocWithTimeout(buffer, file.originalName, validation.mime);
        } catch (extractErr) {
          console.warn('[LandingAsset] Trích xuất text tài liệu thất bại:', extractErr.message);
          text = '';
        }

        const remainingBudget = TEXT_BUDGET_CHARS - totalDocChars;
        const fileLimit = Math.min(TEXT_PER_FILE_CHARS, remainingBudget);
        const trimmed = String(text || '').trim().slice(0, fileLimit);

        if (trimmed) {
          totalDocChars += trimmed.length;
          documents.push({
            originalName: file.originalName || 'Tài liệu',
            text: trimmed,
          });
        }
      }
    }
  }

  return { assets, documents };
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
