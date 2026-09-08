import { normalizeLandingLpTrackApiBase } from './normalizeLandingLpTrackApiBase.js';

/**
 * Gỡ khối script do hệ thống tự chèn (để lần lưu sau idempotent, tránh nhân đôi script).
 * Cũng gỡ iframe cũ do admin từng paste từ Lead Form Config.
 */
export function stripFounderLandingAutoBlocks(html) {
  let out = String(html ?? '');
  out = out.replace(/<div\s[^>]*data-founder-lp-injected\s*=[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*\/>\s*/gi, '');
  out = out.replace(/<script\s[^>]*founderai-capture\.js[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/<script\s[^>]*founderai-capture\.js[^>]*\/>\s*/gi, '');
  // Strip iframe cũ do admin từng paste từ Lead Form Config.
  out = out.replace(/<iframe[^>]*embed\/lead.?form[^>]*>[\s\S]*?<\/iframe>\s*/gi, '');
  out = out.replace(/<iframe[^>]*embed\/lead.?form[^>]*\/?>\s*/gi, '');
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
 * Xem trước gần đúng bản sẽ lưu (strip + rewrite + inject script) — dùng origin + VITE_API_URL hiện tại.
 * Inject CẢ lp-track.js + founderai-capture.js để preview đồng nhất với backend.
 */
export function prepareLandingHtmlForPreview(html, { slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return String(html ?? '');
  let out = stripFounderLandingAutoBlocks(html);
  out = rewriteHttpAnchorsToTrack(out, { slug: s, apiBase });
  out = injectLandingEnhancements(out, { slug: s, frontendOrigin, apiBase });
  return out;
}

/**
 * Chèn `lp-track.js` + `founderai-capture.js` vào HTML landing page.
 * * lp-track.js: tracking view + click
 * * founderai-capture.js: auto-capture form (tự động suy name từ id/placeholder,
 *   dùng capture phase để ưu tiên hơn custom submit handler).
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

  if (out.includes('data-founder-lp-injected="1"')) {
    return out;
  }

  const trackScriptSrc = `${origin}/lp-track.js`;
  const captureScriptSrc = `${origin}/founderai-capture.js`;

  const hasTrackScript = /lp-track\.js/i.test(out);
  const hasCaptureScript = /founderai-capture\.js/i.test(out);

  let scriptBlock = '';
  if (!hasTrackScript) {
    scriptBlock += `<script src="${trackScriptSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;
  }
  if (!hasCaptureScript) {
    scriptBlock += `<script src="${captureScriptSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;
  }

  if (!scriptBlock.trim()) return out;

  const injectBlock = `<div data-founder-lp-injected="1" style="display:none" aria-hidden="true"></div>\n${scriptBlock}`;
  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${injectBlock}</body>`);
  }
  if (/<\/html>/i.test(out)) {
    return out.replace(/<\/html>/i, `${injectBlock}</html>`);
  }
  return `${out}\n${injectBlock}`;
}
