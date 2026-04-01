import uploadController from '../../controllers/upload.controller.js';
import { verifyFileToken } from '../../utils/fileDownloadToken.js';

/**
 * Lấy storage key `uploads/...` từ URL lưu trong DB (đường dẫn trực tiếp hoặc link `/file/<token>`).
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function extractStorageKeyFromImageUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const direct = uploadController.normalizeStorageKey(s);
  if (direct) return direct;
  try {
    const u = /^https?:\/\//i.test(s) ? new URL(s) : new URL(s, 'http://localhost');
    const m = u.pathname.match(/\/file\/([^/]+)/);
    if (m && m[1]) {
      const payload = verifyFileToken(decodeURIComponent(m[1]));
      const sk = payload.sk || '';
      return uploadController.normalizeStorageKey(sk);
    }
  } catch {
    // Token lỗi hoặc URL ngoài hệ thống
  }
  return '';
}

/**
 * Xóa file trong thư mục uploads (lỗi I/O không throw).
 *
 * @param {string} storageKey
 * @param {string} [logTag]
 * @returns {Promise<void>}
 */
export async function deleteUploadedFileIfAny(storageKey, logTag = 'landingImageAsset') {
  if (!storageKey) return;
  try {
    await uploadController.deleteFromS3([storageKey]);
  } catch (e) {
    console.warn(`[${logTag}] deleteUploadedFileIfAny`, storageKey, e?.message || e);
  }
}

/**
 * URL ảnh tùy chọn: http(s) hoặc rỗng (null).
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeOptionalHttpImageUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  const err = new Error('imageUrl phải là URL http(s) hoặc để trống');
  err.statusCode = 400;
  throw err;
}

/**
 * Chuyển file từ `temp_uploads/` sang `uploads/` (chỉ gọi khi sắp ghi DB thành công;
 * nếu insert/update lỗi sau bước này, service phải gọi `deleteUploadedFileIfAny` cho URL vừa tạo).
 *
 * @param {string} tempId
 * @param {string} originalName
 * @param {number} userId
 * @returns {Promise<string|null>} URL public hoặc null
 */
export async function moveTempUploadToPermanent(tempId, originalName, userId) {
  const moved = await uploadController.moveToS3([{ tempId, originalName }], userId);
  return moved[0]?.url || null;
}
