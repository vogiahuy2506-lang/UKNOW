/**
 * Đích chuyển hướng của link tracking landing (`GET /api/public/landing-track/go?slug=&u=`).
 *
 * Endpoint công khai nên KHÔNG được chuyển hướng tới URL tuỳ ý (open redirect: kẻ xấu dựng link
 * mang tên miền của hệ thống trỏ sang trang lừa đảo). Đích chỉ hợp lệ khi:
 *   1. là URL http/https có hostname (`isValidPublicLandingRedirectUrl`), VÀ
 *   2. hoặc nằm trên host được phép (host của chính landing, frontend), hoặc xuất hiện trong danh
 *      sách link của HTML landing đã lưu (`extractLandingLinkTargets`).
 *
 * Link `/landing-track/go` chỉ sinh ra từ HTML tĩnh (bản cũ viết lại mọi `<a href="http...">` lúc
 * lưu; từ v2.0 HTML giữ link gốc và `lp-track.js` đếm click bằng beacon, không đi qua endpoint này),
 * nên mọi click thật đều trỏ tới một link có trong HTML đã lưu — link do script chèn động không bao
 * giờ mang URL `/landing-track/go`.
 */

const TRACK_PATH_NEEDLE = '/public/landing-track/go';

/**
 * Kiểm tra cú pháp URL đích: parse được, giao thức `http:`/`https:` (chặn javascript:, data:,
 * file:, ...), có hostname. KHÔNG tự nó quyết định đích có được phép hay không — xem
 * `isAllowedLandingRedirectTarget`.
 *
 * @param {string} urlString URL đích (đã decode hoặc chưa decode đều có thể parse lại)
 * @returns {boolean}
 */
export function isValidPublicLandingRedirectUrl(urlString) {
  let u;
  try {
    u = new URL(String(urlString || '').trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (!String(u.hostname || '').trim()) return false;
  return true;
}

/**
 * Dạng chuẩn để so khớp hai URL: parse bằng WHATWG URL (hạ chữ thường scheme/host, bỏ cổng mặc
 * định, mã hoá phần trăm thống nhất), bỏ fragment `#...`. Không phải http/https → null.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeRedirectTarget(value) {
  let u;
  try {
    u = new URL(String(value ?? '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  u.hash = '';
  return u.href;
}

/**
 * Hostname (chữ thường) của một URL/origin; lỗi → null.
 *
 * @param {string} value
 * @returns {string|null}
 */
export function hostnameOf(value) {
  try {
    return new URL(String(value ?? '').trim()).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** Giải mã thực thể HTML trong giá trị thuộc tính (`&amp;`, `&#38;`, `&#x26;`, ...). */
function decodeHtmlAttribute(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[lower] ?? match;
  });
}

/** Link tracking cũ `.../public/landing-track/go?slug=..&u=<đích>` → URL đích; khác → null. */
function unwrapTrackingHref(href) {
  if (!href.includes(TRACK_PATH_NEEDLE)) return null;
  try {
    const u = new URL(href, 'http://tracking.invalid');
    return u.searchParams.get('u') || u.searchParams.get('url') || null;
  } catch {
    return null;
  }
}

/**
 * Tập URL đích (dạng chuẩn `normalizeRedirectTarget`) của mọi thuộc tính `href` trong HTML
 * landing. Với link tracking cũ, lấy URL đích nằm trong tham số `u`/`url`. Lấy cả bản đã giải mã
 * thực thể HTML lẫn bản thô (link cũ từng được viết lại từ giá trị thô của thuộc tính).
 *
 * @param {string} html
 * @returns {Set<string>}
 */
export function extractLandingLinkTargets(html) {
  const targets = new Set();
  const source = String(html ?? '');
  if (!source) return targets;
  const hrefRe = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;
  let match;
  while ((match = hrefRe.exec(source)) !== null) {
    const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (!raw) continue;
    for (const candidate of new Set([decodeHtmlAttribute(raw).trim(), raw])) {
      const unwrapped = unwrapTrackingHref(candidate);
      const key = normalizeRedirectTarget(unwrapped ?? candidate);
      if (key) targets.add(key);
    }
  }
  return targets;
}

/**
 * Đích có được phép chuyển hướng tới không (xem chú thích đầu file).
 *
 * @param {string} target URL đích từ query
 * @param {object} opts
 * @param {string} [opts.html] HTML landing đã lưu
 * @param {Iterable<string>} [opts.allowedHosts] hostname luôn được phép (chữ thường)
 * @returns {boolean}
 */
export function isAllowedLandingRedirectTarget(target, { html = '', allowedHosts = [] } = {}) {
  if (!isValidPublicLandingRedirectUrl(target)) return false;
  const key = normalizeRedirectTarget(target);
  if (!key) return false;
  const host = hostnameOf(key);
  const hosts = new Set([...allowedHosts].filter(Boolean).map((h) => String(h).toLowerCase()));
  if (host && hosts.has(host)) return true;
  return extractLandingLinkTargets(html).has(key);
}
