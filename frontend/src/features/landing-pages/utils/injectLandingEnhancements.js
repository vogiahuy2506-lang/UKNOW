import { normalizeLandingLpTrackApiBase } from './normalizeLandingLpTrackApiBase.js';

/**
 * Gỡ khối iframe/script do UKnow chèn (đồng bộ backend `stripUknowLandingAutoBlocks`).
 */
export function stripUknowLandingAutoBlocks(html) {
  let out = String(html ?? '');
  out = out.replace(/<section\s[^>]*data-uknow-lp-embed\s*=[^>]*>[\s\S]*?<\/section>\s*/gi, '');
  out = out.replace(/<div\s[^>]*data-uknow-lp-injected\s*=[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*\/>\s*/gi, '');
  return out;
}

/**
 * Rewrite `href` http(s) trên `<a>` sang URL tracking (giống backend) và gắn `target="_blank"` + `rel` khi là link tuyệt đối/tracking.
 */
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
    /** Đồng bộ backend: link http(s)/tracking mở tab mới khi không qua lp-track. */
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
 * Xem trước gần đúng bản sẽ lưu (strip + rewrite + chỉ inject script tracking) — dùng origin + VITE_API_URL hiện tại.
 */
export function prepareLandingHtmlForPreview(html, { slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return String(html ?? '');
  let out = stripUknowLandingAutoBlocks(html);
  out = rewriteHttpAnchorsToTrack(out, { slug: s, apiBase });
  out = injectLandingEnhancements(out, { slug: s, frontendOrigin, apiBase });
  return out;
}

/**
 * Sinh khối HTML để admin copy (iframe tách riêng; khi Lưu chỉ server chèn `lp-track.js`).
 *
 * @param {{ slug: string, frontendOrigin: string, apiBase: string }} opts
 * @returns {{ iframeBlock: string, scriptBlock: string, combined: string }}
 */
export function getLandingManualInsertSnippets({ slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  const origin = String(frontendOrigin || '').replace(/\/+$/, '');
  const api = normalizeLandingLpTrackApiBase(apiBase);
  if (!s || !origin || !api) {
    return { iframeBlock: '', scriptBlock: '', combined: '' };
  }
  const embedUrl = `${origin}/embed/lead-form?slug=${encodeURIComponent(s)}`;
  const scriptSrc = `${origin}/lp-track.js`;
  /** Không bọc section — dán đúng vị trí layout; chiều cao iframe được lp-track.js chỉnh qua postMessage từ trang embed. */
  const iframeBlock = `<iframe src="${embedUrl}" width="430" height="720" style="border:0;display:block;width:430px;max-width:100%;vertical-align:top;overflow:hidden" title="Đăng ký UKnow" loading="lazy"></iframe>\n`;
  const scriptBlock = `<div data-uknow-lp-injected="1" style="display:none" aria-hidden="true"></div>\n<script src="${scriptSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;
  return {
    iframeBlock,
    scriptBlock,
    combined: `${iframeBlock}${scriptBlock}`,
  };
}

/**
 * Giống backend `landingHtmlInjection.util.js`: chỉ chèn `lp-track.js` (iframe form dán tay).
 *
 * @param {string} html
 * @param {{ slug: string, frontendOrigin: string, apiBase: string }} opts
 * @returns {string}
 */
export function injectLandingEnhancements(html, { slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  let out = String(html ?? '');
  if (!s) return out;

  const origin = String(frontendOrigin || '').replace(/\/+$/, '');
  const api = normalizeLandingLpTrackApiBase(apiBase);
  if (!origin || !api) return out;

  if (out.includes('data-uknow-lp-injected="1"')) {
    return out;
  }

  const scriptSrc = `${origin}/lp-track.js`;

  const hasTrackScript = /lp-track\.js/i.test(out);

  const scriptBlock = hasTrackScript
    ? ''
    : `<div data-uknow-lp-injected="1" style="display:none" aria-hidden="true"></div>\n<script src="${scriptSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;

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
