/**
 * Gỡ các khối do hệ thống tự chèn trước đó (để lần lưu sau idempotent, tránh nhân đôi iframe/script).
 *
 * Luồng:
 * 1. Xóa `<section data-founder-lp-embed>` (iframe form) — nhưng giữ lại
 *    nếu section chứa `<!-- UKNOW_LP_FORM -->` (marker placeholder do admin
 *    dán tay): khi đó chỉ strip phần iframe bên trong để idempotent
 *    `autoInjectLeadFormIfMissing` chèn lại. Nếu strip nguyên section, vòng
 *    lặp save sẽ mất form.
 * 2. Xóa `<div data-founder-lp-injected>` và `<script ... lp-track.js ...>`.
 *
 * @param {string} html
 * @returns {string}
 */
import { LANDING_FORM_PLACEHOLDER } from './landingEditGuard.util.js';

export function stripFounderLandingAutoBlocks(html) {
  let out = String(html ?? '');
  // Section auto-injected có marker placeholder (do chính autoInject chèn)
  // → chỉ xóa phần iframe bên trong, giữ lại khung + marker.
  // Pattern: tìm `<section ... data-founder-lp-embed="..." ...>` ... `</section>`,
  // trong đó có chuỗi LANDING_FORM_PLACEHOLDER. Thay phần giữa (từ sau marker
  // đến `</section>`) bằng `</section>` (giữ khung + marker, bỏ iframe cũ).
  const marker = LANDING_FORM_PLACEHOLDER;
  const sectionStartRe = /<section\s[^>]*data-founder-lp-embed\s*=[^>]*>/gi;
  let cursor = 0;
  let next = out;
  let result = '';
  let match;
  while ((match = sectionStartRe.exec(next)) !== null) {
    result += next.slice(cursor, match.index);
    const startIdx = match.index;
    const openTagEnd = sectionStartRe.lastIndex;
    const closeIdx = next.indexOf('</section>', openTagEnd);
    if (closeIdx === -1) {
      result += next.slice(startIdx);
      cursor = next.length;
      break;
    }
    const sectionBody = next.slice(openTagEnd, closeIdx);
    if (sectionBody.includes(marker)) {
      // Section chứa marker placeholder → giữ khung + toàn bộ nội dung từ
      // đầu section đến hết marker, bỏ phần sau marker (iframe cũ + tag đóng
      // h2 nếu có).
      const markerIdx = sectionBody.indexOf(marker);
      result += next.slice(startIdx, openTagEnd + markerIdx + marker.length) + '</section>';
      cursor = closeIdx + '</section>'.length;
    } else {
      // Section không có marker (admin dán iframe raw) → xóa nguyên section.
      cursor = closeIdx + '</section>'.length;
    }
  }
  result += next.slice(cursor);
  out = result;
  out = out.replace(/<div\s[^>]*data-founder-lp-injected\s*=[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*\/>\s*/gi, '');
  return out;
}

/**
 * Đổi mọi `href` http(s) trên thẻ `<a>` sang URL tracking (redirect có ghi `click`), giống hành vi `lp-track.js`.
 * Bỏ qua URL đã là `/public/landing-track/go`, mailto, tel, javascript.
 *
 * Luồng:
 * 1. Duyệt từng thẻ mở `<a ...>`.
 * 2. Trong phần thuộc tính, thay `href="https://..."` / `href='...'` bằng URL có query `slug` + `u`.
 * 3. Với mọi `href` http(s) hoặc đã là URL tracking, bổ sung `target="_blank"` và `rel="noopener noreferrer"` nếu chưa có (mở tab mới).
 *
 * @param {string} html
 * @param {{ slug: string, apiBase: string }} opts
 * @returns {string}
 */
/**
 * Chuẩn hóa gốc API cho lp-track: gộp lặp `/api/api` (thường do BACKEND_PUBLIC_URL đã có `/api` mà vẫn nối thêm).
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLandingLpTrackApiBase(raw) {
  let base = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return base;
  while (/\/api\/api$/i.test(base)) {
    base = base.replace(/\/api\/api$/i, '/api');
  }
  return base;
}

export function rewriteHttpAnchorsToTrack(html, { slug, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  const api = normalizeLandingLpTrackApiBase(apiBase);
  if (!s || !api) return String(html ?? '');
  const trackNeedle = '/public/landing-track/go';
  const trackPrefix = `${api}${trackNeedle}?slug=${encodeURIComponent(s)}&u=`;

  return String(html ?? '').replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    const rewriteQuoted = (fragment) =>
      String(fragment)
        .replace(/\bhref\s*=\s*(")(https?:\/\/[^"]*)\1/gi, (m, q, url) => {
          const raw = String(url || '').trim();
          if (!raw || raw.includes(trackNeedle)) return m;
          return `href=${q}${trackPrefix}${encodeURIComponent(raw)}${q}`;
        })
        .replace(/\bhref\s*=\s*(')(https?:\/\/[^']*)\1/gi, (m, q, url) => {
          const raw = String(url || '').trim();
          if (!raw || raw.includes(trackNeedle)) return m;
          return `href=${q}${trackPrefix}${encodeURIComponent(raw)}${q}`;
        });
    let next = rewriteQuoted(attrs);
    /** Link tuyệt đối hoặc redirect tracking — đảm bảo mở tab mới khi người dùng không dùng lp-track.js. */
    const hasHttpOrTrackHref =
      /\bhref\s*=\s*["']https?:\/\//i.test(next) || /\bhref\s*=\s*["'][^"']*landing-track\/go/i.test(next);
    if (hasHttpOrTrackHref) {
      if (!/\btarget\s*=/i.test(next)) next += ' target="_blank"';
      if (!/\brel\s*=/i.test(next)) next += ' rel="noopener noreferrer"';
    }
    if (next === attrs) return full;
    return `<a${next}>`;
  });
}

/**
 * Chuẩn hóa HTML trước khi lưu DB:
 *   1. Gỡ khối cũ (iframe/script đã chèn ở lần save trước — idempotent).
 *   2. Rewrite link tracking trên `<a href>`.
 *   3. Auto-inject iframe form nếu HTML đã strip không còn form đăng ký.
 *   4. Chèn script `lp-track.js` (idempotent).
 *
 * @param {string} html
 * @param {{ slug: string, frontendOrigin: string, apiBase: string }} opts
 * @returns {string}
 */
export function prepareLandingHtmlOnSave(html, { slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return String(html ?? '');
  let out = stripFounderLandingAutoBlocks(html);
  out = rewriteHttpAnchorsToTrack(out, { slug: s, apiBase });
  out = autoInjectLeadFormIfMissing(out, { slug: s, frontendOrigin });
  out = injectLandingEnhancements(out, { slug: s, frontendOrigin, apiBase });
  return out;
}

/**
 * Idempotent: đảm bảo iframe form tồn tại trong HTML.
 *
 * 2 trường hợp:
 *  - HTML đã có iframe thật (`/embed/lead-form`): giữ nguyên.
 *  - HTML có section rỗng với marker placeholder (do `stripFounderLandingAutoBlocks`
 *    giữ lại ở lần save trước): chèn iframe vào ngay sau marker trong section đó.
 *  - HTML không có gì: chèn wrapped mới (section + marker + iframe) trước `</body>`.
 *
 * Marker placeholder giúp AI Edit guard nhận diện và bảo vệ form khỏi bị
 * xóa khi AI tái cấu trúc trang (đồng bộ `LANDING_FORM_PLACEHOLDER`).
 *
 * @param {string} html
 * @param {{ slug: string, frontendOrigin: string }} opts
 * @returns {string}
 */
export function autoInjectLeadFormIfMissing(html, { slug, frontendOrigin }) {
  const s = String(slug || '').trim().toLowerCase();
  const origin = String(frontendOrigin || '').replace(/\/+$/, '');
  if (!s || !origin) return String(html ?? '');
  let out = String(html ?? '');
  if (!out) return out;
  // Đã có iframe thật → xong.
  if (out.includes('/embed/lead-form')) return out;

  const embedUrl = `${origin}/embed/lead-form?slug=${encodeURIComponent(s)}`;
  const iframeBlock = `<iframe src="${embedUrl}" width="430" height="720" style="border:0;display:block;width:430px;max-width:100%;vertical-align:top;overflow:hidden" title="Đăng ký Founder AI" loading="lazy"></iframe>\n`;

  // Trường hợp 1: section rỗng có marker placeholder → chèn iframe vào section đó.
  // Tìm vị trí `</section>` ngay sau marker, chèn iframe trước đó (cùng format
  // với wrapped mới để idempotent).
  const markerIdx = out.indexOf(LANDING_FORM_PLACEHOLDER);
  if (markerIdx !== -1) {
    const closeIdx = out.indexOf('</section>', markerIdx);
    if (closeIdx !== -1) {
      // Tìm vị trí bắt đầu dòng chứa </section> để chèn iframe ở đầu dòng đó,
      // khớp format của wrapped (mỗi thẻ 1 dòng).
      const beforeClose = out.slice(0, closeIdx);
      const lineStart = beforeClose.lastIndexOf('\n') + 1;
      const indent = out.slice(lineStart, closeIdx).match(/^\s*/)?.[0] || '';
      return `${beforeClose}\n${indent}${iframeBlock.trimEnd()}\n${out.slice(closeIdx)}`;
    }
  }

  // Trường hợp 2: chưa có gì → chèn wrapped mới.
  const wrapped = `\n<section data-founder-lp-embed="1" class="py-8 px-4 max-w-3xl mx-auto">\n  <h2 class="text-xl font-semibold text-gray-900 mb-4">Đăng ký tư vấn</h2>\n  ${LANDING_FORM_PLACEHOLDER}\n  ${iframeBlock}</section>\n`;
  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${wrapped}</body>`);
  }
  if (/<\/html>/i.test(out)) {
    return out.replace(/<\/html>/i, `${wrapped}</html>`);
  }
  return `${out}${wrapped}`;
}

/**
 * Bổ sung script tracking vào chuỗi HTML (iframe form không tự chèn — admin copy từ CMS).
 *
 * Luồng:
 * 1. Nếu HTML đã có marker `data-founder-lp-injected` thì bỏ qua toàn bộ (tránh lặp).
 * 2. Nếu đã có `lp-track.js` thì không chèn script trùng.
 * 3. Chèn thẻ script `lp-track.js` (defer) với `data-api-base` + `data-slug` trước `</body>`.
 *
 * @param {string} html
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} opts.frontendOrigin Gốc frontend (vd http://localhost:5174) — host file `lp-track.js` và route `/embed/lead-form`
 * @param {string} opts.apiBase Gốc API (vd http://localhost:5001/api) cho `data-api-base`
 * @returns {string}
 */
export function injectLandingEnhancements(html, { slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  let out = String(html ?? '');
  if (!s) return out;

  const origin = String(frontendOrigin || '').replace(/\/+$/, '');
  const api = normalizeLandingLpTrackApiBase(apiBase);
  if (!origin || !api) return out;

  // Marker tổng — admin/preview có thể chèn một lần để tránh lặp khi merge tay
  if (out.includes('data-founder-lp-injected="1"')) {
    return out;
  }

  const scriptSrc = `${origin}/lp-track.js`;

  const hasTrackScript = /lp-track\.js/i.test(out);

  const scriptBlock = hasTrackScript
    ? ''
    : `<div data-founder-lp-injected="1" style="display:none" aria-hidden="true"></div>\n<script src="${scriptSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;

  const injectBlock = `${scriptBlock}`;
  if (!injectBlock.trim()) return out;

  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${injectBlock}</body>`);
  }
  if (/<\/html>/i.test(out)) {
    return out.replace(/<\/html>/i, `${injectBlock}</html>`);
  }
  return `${out}\n${injectBlock}`;
}

/**
 * Lấy origin frontend từ biến môi trường (ưu tiên FRONTEND_URL, fallback phần tử đầu FRONTEND_URLS).
 *
 * @returns {string}
 */
export function resolveFrontendOriginFromEnv() {
  const primary = String(process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (primary) return primary;
  const first = String(process.env.FRONTEND_URLS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)[0];
  if (first) return first.replace(/\/+$/, '');
  return 'http://localhost:5174';
}

/**
 * Chuỗi `data-api-base` cho lp-track: BACKEND_PUBLIC_URL + `/api` nếu chưa có hậu tố `/api`.
 * Tránh lỗi `/api/api` khi BACKEND_PUBLIC_URL đã khai báo dạng `https://host/api`.
 *
 * @returns {string}
 */
export function resolvePublicApiBaseFromEnv() {
  const base = String(process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!base) return 'http://localhost:5001/api';
  const withApi = /\/api$/i.test(base) ? base : `${base}/api`;
  return normalizeLandingLpTrackApiBase(withApi);
}
