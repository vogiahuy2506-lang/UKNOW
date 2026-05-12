/**
 * Gỡ các khối do hệ thống tự chèn trước đó (để lần lưu sau idempotent, tránh nhân đôi iframe/script).
 *
 * Luồng:
 * 1. Xóa `<section data-founder-lp-embed>` (iframe form).
 * 2. Xóa `<div data-founder-lp-injected>` và `<script ... lp-track.js ...>`.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripFounderLandingAutoBlocks(html) {
  let out = String(html ?? '');
  out = out.replace(/<section\s[^>]*data-founder-lp-embed\s*=[^>]*>[\s\S]*?<\/section>\s*/gi, '');
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
 * Chuẩn hóa HTML trước khi lưu DB: gỡ khối cũ → rewrite link tracking → chỉ chèn script `lp-track.js` (form iframe do admin copy/dán tay).
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
  out = injectLandingEnhancements(out, { slug: s, frontendOrigin, apiBase });
  return out;
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
