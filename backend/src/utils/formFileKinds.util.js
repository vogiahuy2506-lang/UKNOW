/**
 * Danh mục loại tệp khách được TẢI LÊN qua trường `file` của biểu mẫu
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4b, QĐ7).
 *
 * MỘT nơi duy nhất định nghĩa "loại nào nhận được": đuôi tệp, MIME, chữ ký (magic bytes). Frontend giữ bản sao
 * `frontend/src/features/forms/utils/formFileKinds.util.js` (không có chữ ký) và có spec hợp đồng đối chiếu hai bên.
 *
 * Nguyên tắc an toàn (chủ biểu mẫu KHÔNG chỉnh được):
 *  - Chủ chỉ chọn trong các NHÓM có tên dưới đây; loại nào không nằm trong danh mục thì không thể nhận, kể cả khi chủ muốn.
 *  - Danh sách CẤM (`FORBIDDEN_FILE_EXTENSIONS`) là lớp bảo vệ thứ hai: tên tệp chứa đuôi nguy hiểm ở BẤT KỲ đoạn nào
 *    ("hoadon.exe.pdf") cũng bị từ chối. Spec ghim: không đuôi nào của danh mục nằm trong danh sách cấm.
 *  - Đuôi + MIME khai báo chỉ là bước SÀNG; bước quyết định là chữ ký thật của vài trăm byte đầu, đọc lúc nộp bài
 *    (`verifyFileSignature`) — đổi đuôi .exe thành .jpg không qua được.
 *  - Tệp luôn được phục vụ dạng `attachment` + `nosniff` (xem fileServePolicy.util.js), không bao giờ mở inline trên tên miền của ta.
 *
 * File này không import gì (thuần, dùng được ở cả service lẫn spec).
 */

export const FORM_FILE_KIND_IDS = Object.freeze([
  'image',
  'pdf',
  'word',
  'excel',
  'powerpoint',
  'text',
  'audio',
  'video',
  'zip',
]);

/** Đuôi (không dấu chấm, chữ thường) và MIME KHAI BÁO được chấp nhận của từng nhóm. */
export const FORM_FILE_KINDS = Object.freeze({
  image: Object.freeze({
    exts: Object.freeze(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']),
    mimes: Object.freeze([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
    ]),
  }),
  pdf: Object.freeze({
    exts: Object.freeze(['pdf']),
    mimes: Object.freeze(['application/pdf']),
  }),
  word: Object.freeze({
    exts: Object.freeze(['doc', 'docx']),
    mimes: Object.freeze([
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
  }),
  excel: Object.freeze({
    exts: Object.freeze(['xls', 'xlsx', 'csv']),
    mimes: Object.freeze([
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
    ]),
  }),
  powerpoint: Object.freeze({
    exts: Object.freeze(['ppt', 'pptx']),
    mimes: Object.freeze([
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]),
  }),
  text: Object.freeze({
    exts: Object.freeze(['txt']),
    mimes: Object.freeze(['text/plain']),
  }),
  audio: Object.freeze({
    exts: Object.freeze(['mp3', 'm4a', 'wav', 'aac', 'ogg']),
    mimes: Object.freeze([
      'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
      'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/aac', 'audio/x-aac',
      'audio/ogg', 'application/ogg',
    ]),
  }),
  video: Object.freeze({
    exts: Object.freeze(['mp4', 'mov', 'webm']),
    mimes: Object.freeze(['video/mp4', 'video/quicktime', 'video/webm']),
  }),
  zip: Object.freeze({
    exts: Object.freeze(['zip']),
    mimes: Object.freeze(['application/zip', 'application/x-zip-compressed', 'application/x-zip']),
  }),
});

/** MIME chuẩn của từng đuôi — chính MIME này được ràng vào URL ký (khách phải PUT đúng Content-Type này). */
export const CANONICAL_MIME_BY_EXT = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  zip: 'application/zip',
});

/**
 * Đuôi NGUY HIỂM — không bao giờ nằm trong danh mục, và nếu xuất hiện ở bất kỳ đoạn nào của tên tệp thì tên đó bị từ chối.
 * Cố tình dài hơn những gì danh mục cần loại trừ: tệp chạy được, script, trang web/markup (XSS khi mở trên tên miền của ta),
 * macro, ảnh đĩa/gói cài đặt, lối tắt.
 */
export const FORBIDDEN_FILE_EXTENSIONS = Object.freeze([
  // chạy được / cài đặt (Windows, macOS, Linux, Android, iOS, Java)
  'exe', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'dll', 'sys', 'cpl', 'msc', 'gadget',
  'app', 'dmg', 'pkg', 'ipa', 'apk', 'xapk', 'aab', 'deb', 'rpm', 'bin', 'run', 'jar', 'war', 'class',
  // script
  'sh', 'bash', 'csh', 'ksh', 'zsh', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'js', 'mjs', 'cjs', 'jse',
  'py', 'pyc', 'pl', 'rb', 'lua',
  // web / markup — mở trên tên miền của ta là XSS
  'html', 'htm', 'xhtml', 'xht', 'shtml', 'mht', 'mhtml', 'svg', 'svgz', 'xml', 'xsl', 'xslt', 'rdf', 'swf',
  'php', 'php3', 'php4', 'php5', 'phtml', 'phar', 'asp', 'aspx', 'jsp', 'jspx', 'cgi',
  // macro / lối tắt / cấu hình
  'docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm', 'lnk', 'url', 'reg', 'inf', 'webloc', 'desktop',
]);

const FORBIDDEN_SET = new Set(FORBIDDEN_FILE_EXTENSIONS);

// ─── Giới hạn ──────────────────────────────────────────────────────────────────────────────────────

const MB = 1024 * 1024;
export const MIN_FORM_FILE_BYTES = 1 * MB;
/** Trần hệ thống cho MỘT tệp (đổi được ở đây — tệp đi thẳng lên kho bằng URL ký, không qua RAM backend). */
export const MAX_FORM_FILE_BYTES = 1024 * MB;
export const MIN_FORM_FILE_COUNT = 1;
export const MAX_FORM_FILE_COUNT = 10;
export const DEFAULT_FORM_FILE_CONFIG = Object.freeze({
  kinds: Object.freeze(['image', 'pdf']),
  maxBytes: 10 * MB,
  maxFiles: 1,
});
/** Số byte đầu đọc để kiểm chữ ký. */
export const FORM_FILE_HEAD_BYTES = 1024;
/** Tên tệp hiển thị tối đa (đã gồm đuôi). */
export const MAX_FORM_FILE_NAME_LENGTH = 150;

/**
 * Cờ bật/tắt tính năng tải tệp (env `FORM_FILE_UPLOAD_ENABLED`, MẶC ĐỊNH TẮT), đọc LÚC GỌI để đổi không cần dựng lại.
 * Lý do tắt mặc định: CORS bucket cho PUT từ trình duyệt là việc OPS (backend/scripts/gcs-cors-form-uploads.json).
 *
 * @returns {boolean}
 */
export function isFormFileUploadEnabled() {
  return String(process.env.FORM_FILE_UPLOAD_ENABLED || '').trim().toLowerCase() === 'true';
}

function createValidationError(message, code = 'INVALID_FORM_DEFINITION') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

/**
 * Chuẩn hoá `fileConfig` của trường `file`: `{ kinds, maxBytes, maxFiles }`.
 * Vắng/rỗng → mặc định (Ảnh + PDF, 10 MB, 1 tệp). Giá trị SAI (loại lạ, ngoài khoảng, không nguyên) → 400 chứ không
 * âm thầm sửa — chủ biểu mẫu phải thấy mình đã chọn gì.
 *
 * @param {unknown} raw
 * @param {string} [label] nhãn trường (cho câu báo lỗi)
 * @returns {{ kinds: string[], maxBytes: number, maxFiles: number }}
 */
export function normalizeFormFileConfig(raw, label = '') {
  const prefix = label ? `Trường tải tệp "${String(label).slice(0, 30)}": ` : 'Trường tải tệp: ';
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw createValidationError(`${prefix}cấu hình tệp phải là một đối tượng`);
  }
  const src = raw || {};

  let kinds;
  if (src.kinds === undefined || src.kinds === null) {
    kinds = [...DEFAULT_FORM_FILE_CONFIG.kinds];
  } else {
    if (!Array.isArray(src.kinds)) {
      throw createValidationError(`${prefix}danh sách loại tệp phải là một mảng`);
    }
    const seen = new Set();
    for (const item of src.kinds) {
      const id = typeof item === 'string' ? item.trim().toLowerCase() : '';
      if (!FORM_FILE_KIND_IDS.includes(id)) {
        throw createValidationError(`${prefix}loại tệp "${String(item).slice(0, 20)}" không được hỗ trợ`);
      }
      seen.add(id);
    }
    if (seen.size === 0) {
      throw createValidationError(`${prefix}phải chọn ít nhất một loại tệp`);
    }
    // Thứ tự theo danh mục để lưu ổn định (payload so sánh/diff không đổi theo thứ tự tick).
    kinds = FORM_FILE_KIND_IDS.filter((id) => seen.has(id));
  }

  let maxBytes = DEFAULT_FORM_FILE_CONFIG.maxBytes;
  if (src.maxBytes !== undefined && src.maxBytes !== null && src.maxBytes !== '') {
    const n = typeof src.maxBytes === 'number' ? src.maxBytes : Number(src.maxBytes);
    if (!Number.isInteger(n) || n < MIN_FORM_FILE_BYTES || n > MAX_FORM_FILE_BYTES) {
      throw createValidationError(
        `${prefix}dung lượng tối đa mỗi tệp phải từ ${MIN_FORM_FILE_BYTES / MB} MB đến ${MAX_FORM_FILE_BYTES / MB} MB`
      );
    }
    maxBytes = n;
  }

  let maxFiles = DEFAULT_FORM_FILE_CONFIG.maxFiles;
  if (src.maxFiles !== undefined && src.maxFiles !== null && src.maxFiles !== '') {
    const n = typeof src.maxFiles === 'number' ? src.maxFiles : Number(src.maxFiles);
    if (!Number.isInteger(n) || n < MIN_FORM_FILE_COUNT || n > MAX_FORM_FILE_COUNT) {
      throw createValidationError(`${prefix}số tệp tối đa phải từ ${MIN_FORM_FILE_COUNT} đến ${MAX_FORM_FILE_COUNT}`);
    }
    maxFiles = n;
  }

  return { kinds, maxBytes, maxFiles };
}

// ─── Tên tệp / đuôi ────────────────────────────────────────────────────────────────────────────────

/**
 * Đuôi cuối cùng của tên tệp, chữ thường, không dấu chấm; '' nếu không có.
 *
 * @param {unknown} fileName
 * @returns {string}
 */
export function getFileExtension(fileName) {
  const name = String(fileName || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

// Ký tự điều khiển + dấu ngắt dòng Unicode (U+2028/2029). Dựng bằng RegExp từ chuỗi thoát để mã nguồn không chứa ký tự ngắt dòng thật.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp('[\\u0000-\\u001f\\u007f\\u2028\\u2029]', 'g');

/**
 * Tên tệp để LƯU/HIỂN THỊ: bỏ đường dẫn, ký tự điều khiển và ký tự gây rối (`\ / : * ? " < > |`), gộp khoảng trắng,
 * cắt còn tối đa MAX_FORM_FILE_NAME_LENGTH ký tự (giữ nguyên đuôi). Tên khoá lưu trên kho KHÔNG dùng tên này (dùng uuid).
 *
 * @param {unknown} fileName
 * @returns {string} '' khi không còn gì
 */
export function sanitizeUploadFileName(fileName) {
  let name = String(fileName || '').normalize('NFC');
  name = name.split(/[\\/]/).pop() || '';
  name = name
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  if (name.length <= MAX_FORM_FILE_NAME_LENGTH) return name;
  const ext = getFileExtension(name);
  if (!ext) return name.slice(0, MAX_FORM_FILE_NAME_LENGTH);
  const base = name.slice(0, name.length - ext.length - 1);
  return `${base.slice(0, Math.max(1, MAX_FORM_FILE_NAME_LENGTH - ext.length - 1))}.${ext}`;
}

/**
 * Đoạn nào của tên tệp (sau đoạn đầu) là đuôi bị CẤM? Bắt cả "hoadon.exe.pdf" lẫn "anh.php.jpg".
 *
 * @param {unknown} fileName
 * @returns {string|null} đuôi bị cấm đầu tiên tìm thấy, hoặc null
 */
export function findForbiddenExtension(fileName) {
  const segments = String(fileName || '').toLowerCase().split('.');
  for (let i = 1; i < segments.length; i += 1) {
    const seg = segments[i].trim();
    if (FORBIDDEN_SET.has(seg)) return seg;
  }
  return null;
}

/**
 * Tên tệp này có thuộc các nhóm `kinds` của trường không?
 *
 * @param {unknown} fileName
 * @param {string[]} kinds
 * @returns {{ ok: true, kind: string, ext: string, mime: string } | { ok: false, reason: 'forbidden'|'no_extension'|'not_allowed', ext?: string }}
 */
export function resolveFormFileKind(fileName, kinds) {
  const forbidden = findForbiddenExtension(fileName);
  if (forbidden) return { ok: false, reason: 'forbidden', ext: forbidden };
  const ext = getFileExtension(fileName);
  if (!ext) return { ok: false, reason: 'no_extension' };
  for (const kind of Array.isArray(kinds) ? kinds : []) {
    const def = FORM_FILE_KINDS[kind];
    if (def && def.exts.includes(ext)) {
      return { ok: true, kind, ext, mime: CANONICAL_MIME_BY_EXT[ext] };
    }
  }
  return { ok: false, reason: 'not_allowed', ext };
}

/**
 * MIME do trình duyệt khai báo có tương thích với đuôi không? Trình duyệt hay khai rỗng / octet-stream cho .heic, .csv,
 * .m4a… nên rỗng/octet-stream được coi là tương thích (chữ ký thật mới là chốt); MIME cụ thể thì phải thuộc nhóm của đuôi.
 *
 * @param {unknown} declaredMime
 * @param {string} ext
 * @returns {boolean}
 */
export function isDeclaredMimeAcceptable(declaredMime, ext) {
  const mime = String(declaredMime || '').split(';')[0].trim().toLowerCase();
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') return true;
  for (const def of Object.values(FORM_FILE_KINDS)) {
    if (def.exts.includes(ext)) return def.mimes.includes(mime);
  }
  return false;
}

/** Thuộc tính `accept` cho <input type="file"> theo các nhóm. */
export function buildAcceptAttribute(kinds) {
  const parts = [];
  for (const kind of Array.isArray(kinds) ? kinds : []) {
    const def = FORM_FILE_KINDS[kind];
    if (!def) continue;
    for (const ext of def.exts) parts.push(`.${ext}`);
  }
  return parts.join(',');
}

// ─── Chữ ký (magic bytes) ──────────────────────────────────────────────────────────────────────────

function hasBytes(buf, bytes, offset = 0) {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buf[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function hasAscii(buf, text, offset = 0) {
  if (buf.length < offset + text.length) return false;
  return buf.toString('latin1', offset, offset + text.length) === text;
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
const QUICKTIME_ATOMS = ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'];

const isJpeg = (b) => hasBytes(b, [0xff, 0xd8, 0xff]);
const isPng = (b) => hasBytes(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (b) => hasAscii(b, 'GIF87a') || hasAscii(b, 'GIF89a');
const isWebp = (b) => hasAscii(b, 'RIFF') && hasAscii(b, 'WEBP', 8);
const isHeif = (b) => hasAscii(b, 'ftyp', 4) && b.length >= 12 && HEIF_BRANDS.has(b.toString('latin1', 8, 12));
const isPdf = (b) => b.subarray(0, FORM_FILE_HEAD_BYTES).indexOf('%PDF-', 0, 'latin1') !== -1;
const isOle2 = (b) => hasBytes(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isZipLike = (b) => hasBytes(b, [0x50, 0x4b, 0x03, 0x04]) || hasBytes(b, [0x50, 0x4b, 0x05, 0x06]) || hasBytes(b, [0x50, 0x4b, 0x07, 0x08]);
const isFtypBox = (b) => hasAscii(b, 'ftyp', 4);
const isQuickTime = (b) => isFtypBox(b) || QUICKTIME_ATOMS.some((atom) => hasAscii(b, atom, 4));
const isMp3 = (b) => hasAscii(b, 'ID3') || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
const isWav = (b) => hasAscii(b, 'RIFF') && hasAscii(b, 'WAVE', 8);
const isAdts = (b) => b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0;
const isOgg = (b) => hasAscii(b, 'OggS');
const isWebm = (b) => hasBytes(b, [0x1a, 0x45, 0xdf, 0xa3]);

/** Tệp thực thi / mã chạy được, bất kể đuôi: PE (MZ), ELF, Mach-O, Java class. */
export function looksLikeExecutable(head) {
  const b = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
  return (
    hasBytes(b, [0x4d, 0x5a])
    || hasBytes(b, [0x7f, 0x45, 0x4c, 0x46])
    || hasBytes(b, [0xfe, 0xed, 0xfa, 0xce])
    || hasBytes(b, [0xfe, 0xed, 0xfa, 0xcf])
    || hasBytes(b, [0xce, 0xfa, 0xed, 0xfe])
    || hasBytes(b, [0xcf, 0xfa, 0xed, 0xfe])
    || hasBytes(b, [0xca, 0xfe, 0xba, 0xbe])
  );
}

/** Văn bản nhìn như HTML / XML / SVG / PHP (mở đầu bằng `<` + chữ, `!` hoặc `?`) — không nhận làm .txt/.csv. */
function looksLikeMarkup(head) {
  let text = head.toString('utf8', 0, Math.min(head.length, 256));
  text = text.replace(/^﻿/, '').trimStart();
  return /^<[a-zA-Z!?]/.test(text);
}

/** Văn bản thuần: không byte NUL / điều khiển lạ (UTF-16 có BOM được chấp nhận) và không giống markup. */
function isPlainText(head) {
  if (hasBytes(head, [0xff, 0xfe]) || hasBytes(head, [0xfe, 0xff])) return true; // UTF-16 BOM
  for (let i = 0; i < head.length; i += 1) {
    const c = head[i];
    // NUL và điều khiển lạ => nhị phân (cho phép TAB/LF/VT/FF/CR và ESC của log có màu).
    if (c < 0x09 || (c > 0x0d && c < 0x20 && c !== 0x1b)) return false;
  }
  return !looksLikeMarkup(head);
}

const SIGNATURE_BY_EXT = Object.freeze({
  jpg: isJpeg,
  jpeg: isJpeg,
  png: isPng,
  gif: isGif,
  webp: isWebp,
  heic: isHeif,
  heif: isHeif,
  pdf: isPdf,
  doc: isOle2,
  xls: isOle2,
  ppt: isOle2,
  docx: isZipLike,
  xlsx: isZipLike,
  pptx: isZipLike,
  zip: isZipLike,
  csv: isPlainText,
  txt: isPlainText,
  mp3: isMp3,
  m4a: isFtypBox,
  wav: isWav,
  aac: (b) => isAdts(b) || isFtypBox(b) || hasAscii(b, 'ID3'),
  ogg: isOgg,
  mp4: isFtypBox,
  mov: isQuickTime,
  webm: isWebm,
});

/**
 * Chữ ký của vài trăm byte đầu có khớp đuôi không? Tệp thực thi bị từ chối trước, bất kể đuôi.
 *
 * @param {string} ext đuôi (chữ thường, không dấu chấm)
 * @param {Buffer} head `FORM_FILE_HEAD_BYTES` byte đầu của tệp
 * @returns {{ ok: true } | { ok: false, reason: 'executable'|'mismatch'|'unknown_extension'|'empty' }}
 */
export function verifyFileSignature(ext, head) {
  const buf = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
  if (buf.length === 0) return { ok: false, reason: 'empty' };
  if (looksLikeExecutable(buf)) return { ok: false, reason: 'executable' };
  const check = SIGNATURE_BY_EXT[String(ext || '').toLowerCase()];
  if (!check) return { ok: false, reason: 'unknown_extension' };
  return check(buf) ? { ok: true } : { ok: false, reason: 'mismatch' };
}
