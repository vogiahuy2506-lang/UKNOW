/**
 * Lỗi kho lưu trữ tệp.
 *
 * Phân biệt hai chuyện hoàn toàn khác nhau mà trước đây bị gộp làm một:
 *   - tệp KHÔNG CÓ trên kho (GCS trả 404)        -> `exists()` = false, `getMetadata()` = null
 *   - kho KHÔNG TRUY CẬP ĐƯỢC (403 mất role IAM, mạng, khoá hỏng...) -> ném StorageUnavailableError
 * Gộp hai thứ làm một khiến đối soát đánh dấu "mất tệp" (orphaned) hàng loạt khi chỉ là mất quyền.
 */

export const STORAGE_UNAVAILABLE_MESSAGE =
  'Kho lưu trữ tệp tạm thời không truy cập được. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.';
export const STORAGE_NOT_FOUND_MESSAGE = 'Tệp đính kèm không còn trong kho lưu trữ.';

export class StorageUnavailableError extends Error {
  constructor(cause = null) {
    super(STORAGE_UNAVAILABLE_MESSAGE, cause ? { cause } : undefined);
    this.name = 'StorageUnavailableError';
    this.code = 'STORAGE_UNAVAILABLE';
    if (cause && this.cause === undefined) this.cause = cause;
  }
}

export class StorageNotFoundError extends Error {
  constructor(cause = null) {
    super(STORAGE_NOT_FOUND_MESSAGE, cause ? { cause } : undefined);
    this.name = 'StorageNotFoundError';
    this.code = 'STORAGE_NOT_FOUND';
    if (cause && this.cause === undefined) this.cause = cause;
  }
}

/** `ApiError.code` của @google-cloud/storage là số HTTP; chỉ 404 mới là "không tồn tại". */
export function isGcsNotFound(err) {
  return Number(err?.code) === 404;
}
