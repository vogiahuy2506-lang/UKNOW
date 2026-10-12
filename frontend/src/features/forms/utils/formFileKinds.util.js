/**
 * Danh mục loại tệp của trường `file` — bản FRONTEND của backend/src/utils/formFileKinds.util.js
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4b, QĐ7). Lệch với backend thì backend đúng; spec hợp đồng
 * `backend/src/utils/__tests__/formFileKinds.contract.spec.js` đối chiếu nhóm, đuôi, danh sách cấm và giới hạn của hai bên.
 *
 * Ở đây CHỈ để dựng giao diện (ô chọn nhóm, thuộc tính `accept`, kiểm nhanh trước khi xin URL). Quyết định thật — loại tệp,
 * cỡ thật, chữ ký — luôn do backend làm lúc xin URL và lúc nộp bài.
 */

export const FORM_FILE_KIND_IDS = ['image', 'pdf', 'word', 'excel', 'powerpoint', 'text', 'audio', 'video', 'zip'];

/** Đuôi (chữ thường, không dấu chấm) của từng nhóm. */
export const FORM_FILE_KIND_EXTS = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
  pdf: ['pdf'],
  word: ['doc', 'docx'],
  excel: ['xls', 'xlsx', 'csv'],
  powerpoint: ['ppt', 'pptx'],
  text: ['txt'],
  audio: ['mp3', 'm4a', 'wav', 'aac', 'ogg'],
  video: ['mp4', 'mov', 'webm'],
  zip: ['zip'],
};

/** Đuôi KHÔNG BAO GIỜ nhận (chép từ backend FORBIDDEN_FILE_EXTENSIONS) — tên chứa đuôi này ở bất kỳ đoạn nào đều bị từ chối. */
export const FORBIDDEN_FILE_EXTENSIONS = [
  'exe', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'dll', 'sys', 'cpl', 'msc', 'gadget',
  'app', 'dmg', 'pkg', 'ipa', 'apk', 'xapk', 'aab', 'deb', 'rpm', 'bin', 'run', 'jar', 'war', 'class',
  'sh', 'bash', 'csh', 'ksh', 'zsh', 'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'js', 'mjs', 'cjs', 'jse',
  'py', 'pyc', 'pl', 'rb', 'lua',
  'html', 'htm', 'xhtml', 'xht', 'shtml', 'mht', 'mhtml', 'svg', 'svgz', 'xml', 'xsl', 'xslt', 'rdf', 'swf',
  'php', 'php3', 'php4', 'php5', 'phtml', 'phar', 'asp', 'aspx', 'jsp', 'jspx', 'cgi',
  'docm', 'xlsm', 'pptm', 'dotm', 'xltm', 'potm', 'lnk', 'url', 'reg', 'inf', 'webloc', 'desktop',
];

const MB = 1024 * 1024;
export const MIN_FORM_FILE_MB = 1;
/** Trần hệ thống cho MỘT tệp: 1 GB (khớp backend MAX_FORM_FILE_BYTES). */
export const MAX_FORM_FILE_MB = 1024;
export const MIN_FORM_FILE_COUNT = 1;
export const MAX_FORM_FILE_COUNT = 10;
export const DEFAULT_FORM_FILE_CONFIG = Object.freeze({
  kinds: Object.freeze(['image', 'pdf']),
  maxBytes: 10 * MB,
  maxFiles: 1,
});

/**
 * Cấu hình mặc định cho trường tệp mới (bản sao có thể sửa).
 * @returns {{ kinds: string[], maxBytes: number, maxFiles: number }}
 */
export function makeDefaultFileConfig() {
  return { kinds: [...DEFAULT_FORM_FILE_CONFIG.kinds], maxBytes: DEFAULT_FORM_FILE_CONFIG.maxBytes, maxFiles: DEFAULT_FORM_FILE_CONFIG.maxFiles };
}

/**
 * Chuẩn hoá `fileConfig` nhận từ server về dạng dùng trong trình soạn/renderer: nhóm thuộc danh mục (theo thứ tự danh mục),
 * dung lượng + số tệp là số. Thiếu/hỏng → mặc định. Không ném lỗi (server đã chuẩn hoá; đây chỉ chống dữ liệu lạ).
 *
 * @param {unknown} raw
 * @returns {{ kinds: string[], maxBytes: number, maxFiles: number }}
 */
export function readFileConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const picked = Array.isArray(src.kinds) ? FORM_FILE_KIND_IDS.filter((id) => src.kinds.includes(id)) : [];
  const maxBytes = Number(src.maxBytes);
  const maxFiles = Number(src.maxFiles);
  return {
    kinds: picked.length > 0 ? picked : [...DEFAULT_FORM_FILE_CONFIG.kinds],
    maxBytes: Number.isInteger(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_FORM_FILE_CONFIG.maxBytes,
    maxFiles: Number.isInteger(maxFiles) && maxFiles > 0 ? maxFiles : DEFAULT_FORM_FILE_CONFIG.maxFiles,
  };
}

/** Đuôi cuối của tên tệp, chữ thường, không dấu chấm ('' nếu không có). */
export function getFileExtension(fileName) {
  const name = String(fileName || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** Thuộc tính `accept` cho <input type="file"> theo các nhóm ('.jpg,.png,...'). */
export function buildAcceptAttribute(kinds) {
  return (Array.isArray(kinds) ? kinds : [])
    .flatMap((kind) => FORM_FILE_KIND_EXTS[kind] || [])
    .map((ext) => `.${ext}`)
    .join(',');
}

/** Danh sách đuôi để báo cho người dùng: "jpg, png, pdf". */
export function describeAllowedExtensions(kinds) {
  return (Array.isArray(kinds) ? kinds : []).flatMap((kind) => FORM_FILE_KIND_EXTS[kind] || []).join(', ');
}

/**
 * Kiểm nhanh một tệp người dùng vừa chọn TRƯỚC khi xin URL (backend kiểm lại đầy đủ).
 *
 * @param {{ name?: string, size?: number }} file
 * @param {{ kinds: string[], maxBytes: number }} config
 * @returns {{ ok: true } | { ok: false, reason: 'empty'|'forbidden'|'type'|'size' }}
 */
export function validateClientFile(file, config) {
  if (!file || !Number.isFinite(file.size) || file.size < 1) return { ok: false, reason: 'empty' };
  const segments = String(file.name || '').toLowerCase().split('.');
  for (let i = 1; i < segments.length; i += 1) {
    if (FORBIDDEN_FILE_EXTENSIONS.includes(segments[i].trim())) return { ok: false, reason: 'forbidden' };
  }
  const ext = getFileExtension(file.name);
  const allowed = (config.kinds || []).flatMap((kind) => FORM_FILE_KIND_EXTS[kind] || []);
  if (!ext || !allowed.includes(ext)) return { ok: false, reason: 'type' };
  if (file.size > config.maxBytes) return { ok: false, reason: 'size' };
  return { ok: true };
}

/**
 * Dung lượng dễ đọc: "850 KB", "10 MB", "1,5 GB" (dấu thập phân theo `locale`).
 *
 * @param {number} bytes
 * @param {string} [locale]
 * @returns {string}
 */
export function formatFileSize(bytes, locale = 'vi') {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '';
  const fmt = (value) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1 }).format(value);
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${fmt(n / 1024)} KB`;
  if (n < 1024 * MB) return `${fmt(n / MB)} MB`;
  return `${fmt(n / (1024 * MB))} GB`;
}
