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

/** Cùng dạng hợp lệ với backend (`landingHtmlInjection.util.js` FORM_SLOT_RE, PR-5b-2a nợ 1) —
 * thêm thuộc tính khác/`=""`/khoảng trắng đều khớp, không khớp khi có nội dung con thật. */
const FORM_SLOT_RE = /<div\b[^>]*\bdata-founderai-form-slot\b(?:=(?:"[^"]*"|'[^']*'))?[^>]*>\s*<\/div>/gi;

function escapeHtmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * PR-5b-2b mục 2 — CHỈ ở chế độ xem trước (srcDoc của iframe trình soạn landing): thay chỗ trống
 * `<div data-founderai-form-slot></div>` bằng khung chấm gợi ý "Biểu mẫu đăng ký sẽ hiện ở đây
 * sau khi lưu". KHÔNG đổi HTML thật sẽ gửi lưu — hàm này chỉ chạm vào chuỗi srcDoc dựng riêng cho
 * iframe preview (`buildCanvasSrcDoc.js`), gọi SAU `prepareLandingHtmlForPreview`, không gọi ở
 * đường lưu thật.
 *
 * @param {string} html
 * @param {string} hintText Chữ hiển thị trong khung — nên truyền từ i18n (vi/en)
 * @returns {string}
 */
export function injectFormSlotPreviewHint(html, hintText) {
  const source = String(html ?? '');
  if (!source) return source;
  const text = escapeHtmlText(hintText || 'Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu');
  const placeholder =
    `<div style="border:2px dashed #f97316;border-radius:12px;padding:32px 16px;` +
    `text-align:center;color:#f97316;background:#fff7ed;font-family:system-ui,sans-serif;` +
    `font-size:14px;">${text}</div>`;
  return source.replace(FORM_SLOT_RE, () => placeholder);
}
