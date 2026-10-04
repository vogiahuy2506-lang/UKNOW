import { scanHtmlTags, getAttr, decodeHtmlEntities } from './landingHtmlScan.util.js';

/**
 * B-6 (rà soát AI 03/10) — nhận diện URL ảnh trong HTML landing BẤT KỂ ĐUÔI.
 *
 * Chốt cũ chỉ bắt URL http(s) có đuôi .png/.jpg/.webp/.gif/.svg (`IMAGE_URL_REGEX`), nên ảnh kho/placeholder
 * không đuôi (`images.unsplash.com/photo-123?w=800`, `picsum.photos/800/600`, `placehold.co/600x400`) lọt vào
 * trang xuất bản — ảnh vỡ hoặc đổi ngẫu nhiên mỗi lần tải. Ở đây ta lấy URL từ các NGỮ CẢNH ảnh thật:
 *   - `<img src|srcset>`, `<source srcset>` (trong `<picture>`), `<video poster>`, `<image href|xlink:href>` (SVG);
 *   - `url(...)` trong thuộc tính bất kỳ (style="background-image:url(...)", class Tailwind `bg-[url('...')]`)
 *     và trong khối `<style>` — TRỪ `@import` và `@font-face` (đó là stylesheet/phông, không phải ảnh).
 * Không đụng `<a href>`, `<link>`, `<script>`, `<iframe>`, `<video src>`: không phải ngữ cảnh ảnh (liên kết ngoài,
 * Google Fonts, nhúng YouTube… vẫn hợp lệ). Chỉ URL tuyệt đối (http/https/`//host`); đường dẫn tương đối,
 * `data:` không bị coi là ảnh bịa (đúng như chốt cũ, xem test T7b).
 *
 * Danh sách cho phép (allowlist) mở rộng tương ứng: mọi URL http(s) có mặt trong văn bản nguồn (hồ sơ doanh
 * nghiệp / HTML hiện tại của trang) đều hợp lệ, không chỉ URL có đuôi ảnh — logo trong hồ sơ doanh nghiệp có thể
 * là `https://cdn.x.com/logo?id=3`. Thuần: không DB/HTTP.
 */

/** URL http(s) có đuôi ảnh, bất kỳ đâu trong chuỗi — chốt cũ, vẫn giữ để không mất phủ sóng (meta og:image, <a href>…). */
export const IMAGE_URL_REGEX = /https?:\/\/[^"'()\s<>]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^"'()\s<>]*)?/gi;

const EXTERNAL_URL_RE = /^(?:https?:)?\/\//i;
const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>()\\]+/gi;
const TRAILING_PUNCT_RE = /[.,;:!?\]}]+$/;
const ENTITY_QUOTE_SPLIT_RE = /&(?:quot|apos|#0*39|#x0*27);/i;
const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]+))\s*\)/gi;

/** URL tuyệt đối (http, https hoặc `//host`) — chỉ loại này mới có thể là "ảnh bịa ngoài hệ thống". */
export function isExternalUrl(url) {
  return EXTERNAL_URL_RE.test(String(url ?? ''));
}

/** Giải mã thực thể + cắt khoảng trắng: dạng chuẩn để so khớp. */
export function normalizeImageUrl(raw) {
  return decodeHtmlEntities(raw).trim();
}

/** Tách giá trị `srcset` thành danh sách URL (URL có thể chứa dấu phẩy, ví dụ `w_300,h_200`). */
export function parseSrcsetUrls(srcset) {
  const s = String(srcset ?? '');
  const n = s.length;
  const urls = [];
  let i = 0;
  while (i < n) {
    while (i < n && (/\s/.test(s[i]) || s[i] === ',')) i++;
    if (i >= n) break;
    const start = i;
    while (i < n && !/\s/.test(s[i])) i++;
    let url = s.slice(start, i);
    if (url.endsWith(',')) {
      // Ứng viên không có descriptor: dấu phẩy cuối là dấu phân cách.
      url = url.replace(/,+$/, '');
    } else {
      // Bỏ descriptor (`2x`, `640w`) tới dấu phẩy kế tiếp (ngoài ngoặc).
      let depth = 0;
      while (i < n) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') depth = Math.max(0, depth - 1);
        else if (s[i] === ',' && depth === 0) break;
        i++;
      }
    }
    if (url) urls.push(url);
  }
  return urls;
}

function cssUrls(text) {
  const out = [];
  const css = String(text ?? '');
  if (!/url\(/i.test(css)) return out;
  CSS_URL_RE.lastIndex = 0;
  let m;
  while ((m = CSS_URL_RE.exec(css))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** CSS của khối <style> sau khi bỏ `@import …;` và `@font-face {…}` (stylesheet/phông không phải ảnh). */
function stripNonImageCss(css) {
  return String(css ?? '')
    .replace(/@import\b[^;{}]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*\}/gi, '');
}

/**
 * URL ảnh ngoài (đã chuẩn hoá) mà MỘT thẻ tham chiếu tới. Dùng chung cho quét cả trang và cho gỡ ảnh.
 * @param {{ name: string, attrs: Array<[string,string]>, content?: string }} token start token của scanHtmlTags
 */
export function imageUrlsOfToken(token) {
  const raw = [];
  switch (token.name) {
    case 'img':
      raw.push(getAttr(token, 'src'));
      raw.push(...parseSrcsetUrls(decodeHtmlEntities(getAttr(token, 'srcset'))));
      break;
    case 'source':
      raw.push(...parseSrcsetUrls(decodeHtmlEntities(getAttr(token, 'srcset'))));
      break;
    case 'video':
      raw.push(getAttr(token, 'poster'));
      break;
    case 'image':
      raw.push(getAttr(token, 'href'), getAttr(token, 'xlink:href'));
      break;
    default:
      break;
  }
  // url(...) trong BẤT KỲ thuộc tính nào (style, class Tailwind bg-[url('…')]).
  for (const [, value] of token.attrs) {
    if (value && /url\(/i.test(value)) raw.push(...cssUrls(decodeHtmlEntities(value)));
  }
  if (token.name === 'style' && token.content) raw.push(...cssUrls(stripNonImageCss(token.content)));

  const out = [];
  for (const candidate of raw) {
    if (candidate == null) continue;
    const url = normalizeImageUrl(candidate);
    if (EXTERNAL_URL_RE.test(url)) out.push(url);
  }
  return out;
}

/** Mọi URL ảnh ngoài (chuẩn hoá, không trùng) trong ngữ cảnh ảnh của `html`. */
export function collectImageContextUrls(html) {
  const found = new Set();
  for (const token of scanHtmlTags(html)) {
    if (token.type !== 'start') continue;
    for (const url of imageUrlsOfToken(token)) found.add(url);
  }
  return [...found];
}

/** Mọi URL http(s) trong một đoạn văn bản/HTML nguồn (chuẩn hoá; kèm bản bỏ dấu câu cuối câu và bản cắt ở thực thể nháy). */
export function collectSourceUrls(text) {
  const found = new Set();
  const raw = String(text ?? '');
  if (!raw) return found;
  for (const match of raw.match(URL_IN_TEXT_RE) || []) {
    for (const piece of [match, match.split(ENTITY_QUOTE_SPLIT_RE)[0]]) {
      const url = normalizeImageUrl(piece);
      if (!url) continue;
      found.add(url);
      const noPunct = url.replace(TRAILING_PUNCT_RE, '');
      if (noPunct) found.add(noPunct);
    }
  }
  for (const match of raw.match(IMAGE_URL_REGEX) || []) found.add(normalizeImageUrl(match));
  return found;
}

/**
 * Allowlist ảnh: URL ảnh đính kèm + mọi URL http(s) trong văn bản nguồn.
 * @returns {Set<string>} đã chuẩn hoá
 */
export function buildImageUrlAllowlist({ assets = [], allowedSourceText = '' } = {}) {
  const allow = new Set();
  for (const asset of assets) {
    if (asset?.url) allow.add(normalizeImageUrl(asset.url));
  }
  for (const url of collectSourceUrls(allowedSourceText)) allow.add(url);
  return allow;
}

/** Chuẩn hoá một tập/mảng allowlist đưa từ ngoài vào. */
export function toNormalizedAllowlist(allowlist) {
  const out = new Set();
  for (const url of allowlist || []) {
    if (url) out.add(normalizeImageUrl(url));
  }
  return out;
}

/**
 * URL ảnh trong `html` KHÔNG thuộc allowlist: URL có đuôi ảnh ở bất kỳ đâu (chốt cũ) + URL ở ngữ cảnh ảnh bất kể đuôi.
 * @returns {string[]} chuẩn hoá, không trùng, theo thứ tự xuất hiện của bước tìm
 */
export function findDisallowedImageUrls(html, allowlist) {
  const allow = allowlist instanceof Set ? allowlist : toNormalizedAllowlist(allowlist);
  const candidates = new Set();
  for (const match of String(html ?? '').match(IMAGE_URL_REGEX) || []) candidates.add(normalizeImageUrl(match));
  for (const url of collectImageContextUrls(html)) candidates.add(url);
  return [...candidates].filter((url) => !allow.has(url));
}
