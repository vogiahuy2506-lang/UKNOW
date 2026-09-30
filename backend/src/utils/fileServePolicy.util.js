import path from 'path';

/**
 * Chính sách header khi phục vụ tệp người dùng tải lên (storage backend `stream()`).
 *
 * Tệp được phục vụ từ chính origin của ứng dụng (`/file/:token/download`, `/lp-assets/...`), nên
 * chỉ định dạng KHÔNG chạy được script mới được mở `inline`. Mọi định dạng khác (SVG, HTML, XHTML,
 * XML, JS, CSS, không rõ loại...) luôn trả `attachment`, kể cả khi client xin `preview=true`.
 * `<img src>` bỏ qua Content-Disposition nên ảnh SVG nhúng trong trang vẫn hiển thị bình thường.
 */

const INLINE_SAFE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'application/pdf',
  'text/plain',
]);

const INLINE_SAFE_MIME_PREFIXES = ['audio/', 'video/'];

/**
 * Đuôi tệp → MIME, CHỈ cho các loại được phép inline. Dùng khi không có MIME khai báo (hoặc chỉ
 * có `application/octet-stream`); đuôi không có ở đây thì tệp luôn tải xuống.
 */
const INLINE_MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.weba': 'audio/webm',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.3gp': 'video/3gpp',
};

const GENERIC_BINARY_MIME_TYPES = new Set(['application/octet-stream', 'binary/octet-stream']);

// type/subtype theo cú pháp token của RFC 9110 — giá trị lạ không được đưa vào header.
const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

/** CSP gắn lên mọi tệp phục vụ trừ PDF (trình xem PDF của trình duyệt vỡ khi bị sandbox). */
export const UPLOADED_FILE_CSP = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";

/**
 * `Image/PNG; charset=x` → `image/png`; giá trị sai cú pháp → ''.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeMimeType(value) {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return MIME_TYPE_PATTERN.test(type) ? type : '';
}

/**
 * MIME có được phép hiển thị inline trên origin ứng dụng không.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isInlineSafeMimeType(value) {
  const type = normalizeMimeType(value);
  if (!type) return false;
  if (INLINE_SAFE_MIME_TYPES.has(type)) return true;
  return INLINE_SAFE_MIME_PREFIXES.some((prefix) => type.startsWith(prefix));
}

/**
 * MIME inline-an-toàn suy từ đuôi tệp, '' nếu đuôi không thuộc danh sách cho phép.
 *
 * @param {unknown} name storage key hoặc tên tệp
 * @returns {string}
 */
export function inlineMimeTypeFromName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return INLINE_MIME_BY_EXTENSION[ext] || '';
}

function toAsciiFileName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7e]/g, '_');
}

function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Content-Disposition cho tệp. Tên chỉ gồm ASCII in được giữ nguyên dạng cũ
 * `attachment; filename="..."`; tên có ký tự ngoài ASCII (tiếng Việt) thêm `filename*` UTF-8 —
 * Node từ chối ký tự > 0xFF trong header nên ghép thẳng sẽ làm hỏng lượt tải.
 *
 * @param {'inline'|'attachment'} type
 * @param {unknown} fileName
 * @returns {string}
 */
export function buildContentDisposition(type, fileName) {
  if (type === 'inline') return 'inline';
  const name = String(fileName || 'file')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/"/g, '')
    .trim() || 'file';
  const asciiName = toAsciiFileName(name).replace(/\\/g, '_');
  if (asciiName === name) {
    return `attachment; filename="${name}"`;
  }
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/**
 * Quyết định header phục vụ tệp.
 *
 * - `contentType`: MIME khai báo (đã chuẩn hoá); không có hoặc chỉ là octet-stream thì suy từ đuôi
 *   storage key (chỉ các loại inline-an-toàn). '' = để backend tự xác định như trước.
 * - `inline`: chỉ khi client xin preview VÀ `contentType` thuộc danh sách an toàn.
 * - `isPdf`: PDF không gắn CSP sandbox.
 *
 * @param {{ mimeType?: string, storageKey?: string, fileName?: string, preview?: boolean }} [input]
 * @returns {{ contentType: string, inline: boolean, disposition: string, isPdf: boolean }}
 */
export function resolveFileServePolicy({ mimeType = '', storageKey = '', fileName = '', preview = false } = {}) {
  const declared = normalizeMimeType(mimeType);
  let contentType = declared && !GENERIC_BINARY_MIME_TYPES.has(declared) ? declared : '';
  if (!contentType) {
    contentType = inlineMimeTypeFromName(storageKey) || declared;
  }
  const inline = Boolean(preview) && isInlineSafeMimeType(contentType);
  if (contentType === 'text/plain') {
    contentType = 'text/plain; charset=utf-8';
  }
  return {
    contentType,
    inline,
    disposition: buildContentDisposition(inline ? 'inline' : 'attachment', fileName),
    isPdf: normalizeMimeType(contentType) === 'application/pdf',
  };
}

/**
 * Header chống thực thi nội dung cho response trả bytes tệp: luôn `nosniff`; CSP sandbox cho mọi
 * loại trừ PDF.
 *
 * @param {import('express').Response} res
 * @param {{ isPdf: boolean }} policy
 */
export function applyUploadedFileSecurityHeaders(res, policy) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!policy?.isPdf) {
    res.setHeader('Content-Security-Policy', UPLOADED_FILE_CSP);
  }
}
