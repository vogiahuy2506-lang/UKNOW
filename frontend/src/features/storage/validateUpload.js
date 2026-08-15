import { MAX_UPLOAD_FILE_BYTES, formatBytes } from './storageUtils';

/**
 * Validate selected files before upload against individual size limit and remaining quota.
 *
 * @param {File|File[]|FileList} files - Selected file(s)
 * @param {object|null} usage - Storage usage object from useStorageQuota
 * @returns {{ ok: boolean, reason?: 'file_too_large'|'quota_exceeded', detail?: object }}
 */
export function validateFilesBeforeUpload(files, usage) {
  if (!files) return { ok: true };
  const fileList = Array.isArray(files)
    ? files
    : (files instanceof FileList || typeof files[Symbol.iterator] === 'function')
      ? Array.from(files)
      : [files];

  if (fileList.length === 0) return { ok: true };

  // 1. Từng file > MAX_UPLOAD_FILE_BYTES (50MB) -> file_too_large
  for (const file of fileList) {
    if (!file) continue;
    const size = Number(file.size || 0);
    if (size > MAX_UPLOAD_FILE_BYTES) {
      return {
        ok: false,
        reason: 'file_too_large',
        detail: {
          fileName: file.name || '',
          fileSize: size,
          maxBytes: MAX_UPLOAD_FILE_BYTES,
        },
      };
    }
  }

  // 2. Tổng size các file vừa chọn > usage.remainingBytes -> quota_exceeded
  // CHỈ chặn khi backend bật cờ enforcementEnabled (tránh chặn trước khi BE bật cờ)
  // Nếu cờ tắt hoặc usage == null -> cho qua (fail-open ở FE)
  if (usage?.enforcementEnabled && typeof usage.remainingBytes === 'number') {
    const totalBytes = fileList.reduce((acc, f) => acc + Number(f?.size || 0), 0);
    if (totalBytes > usage.remainingBytes) {
      return {
        ok: false,
        reason: 'quota_exceeded',
        detail: {
          totalBytes,
          remainingBytes: usage.remainingBytes,
        },
      };
    }
  }

  return { ok: true };
}

/**
 * Format human-readable error message from validation result.
 *
 * @param {{ ok: boolean, reason?: string, detail?: object }} validation
 * @param {Function} [t] - i18n translation function
 * @param {string} [locale='vi'] - current language
 * @returns {string|null}
 */
export function getUploadValidationErrorMessage(validation, t, locale = 'vi') {
  if (!validation || validation.ok) return null;

  if (validation.reason === 'file_too_large') {
    const fileName = validation.detail?.fileName;
    if (t) {
      return fileName
        ? t('storageQuota.fileTooLarge', { fileName })
        : t('storageQuota.fileTooLargeGeneric');
    }
    return locale === 'en'
      ? `File ${fileName ? `"${fileName}" ` : ''}exceeds the 50MB limit per file.`
      : `Tệp ${fileName ? `"${fileName}" ` : ''}vượt quá giới hạn 50MB/tệp.`;
  }

  if (validation.reason === 'quota_exceeded') {
    const remaining = formatBytes(validation.detail?.remainingBytes);
    const total = formatBytes(validation.detail?.totalBytes);
    if (t) {
      return t('storageQuota.quotaExceeded', { remaining, total });
    }
    return locale === 'en'
      ? `Workspace only has ${remaining} remaining. Selected files total ${total}. Please remove old files or upgrade your plan.`
      : `Workspace chỉ còn ${remaining}. Tệp bạn chọn nặng ${total}. Hãy xoá bớt tệp cũ hoặc nâng gói.`;
  }

  return locale === 'en' ? 'File upload validation failed.' : 'Tệp tải lên không hợp lệ.';
}

export default validateFilesBeforeUpload;
