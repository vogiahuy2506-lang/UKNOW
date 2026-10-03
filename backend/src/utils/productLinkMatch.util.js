/**
 * Chuẩn hoá và so khớp địa chỉ (URL) cho phễu theo sản phẩm (PLAN_PHEU_BAN_HANG PR-3).
 *
 * "Khớp" = cùng host + path sau khi chuẩn hoá: host chữ thường, bỏ `www.`, bỏ query/hash, bỏ `/` cuối,
 * path chữ thường, bỏ dấu câu dính cuối (link dán trong tin nhắn hay dính `.` `,` `)` — production có link thật
 * `https://hanhchinh.ai.vn/nangcap.`). Khác path cùng host thì KHÔNG khớp.
 * Hàm thuần, không đụng DB/HTTP.
 */

const TRAILING_PUNCTUATION = /[\s.,;:!?)\]}>'"”’]+$/u;

/**
 * @param {unknown} raw
 * @returns {string|null} `host/path` (path không có `/` cuối, có thể rỗng) hoặc null nếu không phải URL web
 */
export function normalizeUrlKey(raw) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim().replace(TRAILING_PUNCTUATION, '');
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    // "hanhchinh.ai.vn/x" (không có scheme) — chỉ nhận khi phần đầu trông như tên miền
    if (/^[^\s/?#:]+\.[^\s/?#:]+/.test(text) && !/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
    else return null;
  }
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!host) return null;
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* giữ nguyên path đã mã hoá */
  }
  path = path.toLowerCase().replace(TRAILING_PUNCTUATION, '').replace(/\/+$/, '');
  return `${host}${path}`;
}

/** Host chính của app (nơi phục vụ `/lp/:slug`): founderai.biz + host của FRONTEND_URL. */
export function getPrimaryLandingHosts(env = process.env) {
  const hosts = new Set(['founderai.biz']);
  const fe = String(env.FRONTEND_URL || '').trim();
  if (fe) {
    try {
      hosts.add(new URL(fe).hostname.toLowerCase().replace(/^www\./, ''));
    } catch {
      /* bỏ qua */
    }
  }
  hosts.delete('localhost');
  return [...hosts];
}

/**
 * Các khoá URL công khai của một landing:
 *  - `<host chính>/lp/<slug>`;
 *  - mỗi tên miền đang `active` trong `landing_page_domains` (subdomain `*.founderai.biz` tự cấp hoặc tên miền riêng) → trang gốc `host`.
 *
 * @param {{ slug?: string|null, hostnames?: string[] }} landing
 * @param {string[]} [primaryHosts]
 * @returns {string[]}
 */
export function landingPublicUrlKeys(landing, primaryHosts = getPrimaryLandingHosts()) {
  const keys = [];
  const slug = String(landing?.slug || '').trim().toLowerCase();
  if (slug) {
    for (const h of primaryHosts) keys.push(`${h}/lp/${slug}`);
  }
  for (const hostname of landing?.hostnames || []) {
    const k = normalizeUrlKey(`https://${String(hostname || '').trim()}`);
    if (k) keys.push(k);
  }
  return keys;
}

/**
 * Tập khoá URL "thuộc sản phẩm": `product_url` (bỏ qua nếu rỗng/không phải URL) + địa chỉ công khai của các landing thuộc sản phẩm.
 *
 * @param {{ productUrl?: string|null, landings?: Array<{ slug?: string|null, hostnames?: string[] }> }} input
 * @param {string[]} [primaryHosts]
 * @returns {Set<string>}
 */
export function buildProductUrlKeys({ productUrl = null, landings = [] } = {}, primaryHosts = getPrimaryLandingHosts()) {
  const keys = new Set();
  const own = normalizeUrlKey(productUrl);
  if (own) keys.add(own);
  for (const landing of landings) {
    for (const k of landingPublicUrlKeys(landing, primaryHosts)) keys.add(k);
  }
  return keys;
}
