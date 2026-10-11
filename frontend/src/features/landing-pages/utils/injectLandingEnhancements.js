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
 * Khôi phục các URL gốc từ link tracking `/public/landing-track/go?slug=...&u=...`
 * nếu HTML từng bị rewrite trước đây hoặc dán từ mã đã qua xử lý.
 */
export function restoreOriginalHttpAnchors(html) {
  if (!html) return String(html ?? '');
  return String(html).replace(/<a\b([^>]*)>/gi, (full, attrs) => {
    const next = attrs.replace(
      /\bhref\s*=\s*(["'])([^"']*\/public\/landing-track\/go[^"']*)\1/gi,
      (m, q, trackUrl) => {
        try {
          const uMatch = trackUrl.match(/(?:[?&]|&amp;)(?:u|url)=([^&#"'\s]+)/i);
          if (uMatch && uMatch[1]) {
            const originalUrl = decodeURIComponent(uMatch[1]);
            if (/^https?:\/\//i.test(originalUrl)) {
              return `href=${q}${originalUrl}${q}`;
            }
          }
        } catch {
          // ignore error
        }
        return m;
      }
    );
    if (next === attrs) return full;
    return `<a${next}>`;
  });
}

/**
 * Xem trước gần đúng bản sẽ lưu (strip + khôi phục link gốc + inject script) — dùng origin + VITE_API_URL hiện tại.
 * Chỉ inject founderai-capture.js (bắt form) để preview giống bản thật; KHÔNG inject lp-track.js.
 *
 * Vì sao bỏ lp-track.js ở preview (C2-01): iframe trình soạn nạp lại mỗi lần chủ sửa nội dung, và
 * lp-track.js gọi `POST /public/landing-analytics/view` mỗi lần nạp (+ ghi `click` khi bấm liên kết ngoài).
 * Server ghi view nếu landing đã xuất bản → chủ ngồi chỉnh sửa tự cộng lượt xem/click giả vào thống kê.
 * Bản LƯU vẫn có lp-track.js (backend `landingHtmlInjection.util.js` chèn lúc lưu) nên số liệu thật không đổi.
 */
export function prepareLandingHtmlForPreview(html, { slug, frontendOrigin, apiBase }) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return String(html ?? '');
  let out = stripFounderLandingAutoBlocks(html);
  out = restoreOriginalHttpAnchors(out);
  out = injectLandingEnhancements(out, { slug: s, frontendOrigin, apiBase, includeTracking: false });
  return out;
}

/**
 * Chèn `lp-track.js` + `founderai-capture.js` vào HTML landing page.
 * * lp-track.js: tracking view + click (bỏ qua khi `includeTracking: false` — chế độ xem trước của chủ)
 * * founderai-capture.js: auto-capture form (tự động suy name từ id/placeholder,
 *   dùng capture phase để ưu tiên hơn custom submit handler).
 *
 * @param {string} html
 * @param {{ slug: string, frontendOrigin: string, apiBase: string, includeTracking?: boolean }} opts
 * @returns {string}
 */
export function injectLandingEnhancements(html, { slug, frontendOrigin, apiBase, includeTracking = true }) {
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
  if (includeTracking && !hasTrackScript) {
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

/** Cùng dạng hợp lệ với backend (`landingHtmlInjection.util.js` FORM_SLOT_RE, PR-5b-2a nợ 1 +
 * PR-5b-2c) — thêm thuộc tính khác/`=""`/khoảng trắng đều khớp, chú thích `<!--…-->` bên trong
 * coi như khoảng trắng, không khớp khi có nội dung con thật. PHẢI giữ giống hệt bản backend —
 * lệch nhau nghĩa là xem trước báo được nhưng lưu lại hỏng (hoặc ngược lại). */
const FORM_SLOT_RE = /<div\b[^>]*\bdata-founderai-form-slot\b(?:=(?:"[^"]*"|'[^']*'))?[^>]*>(?:\s|<!--[\s\S]*?-->)*<\/div>/gi;

/**
 * PR-6 — các LOẠI biểu mẫu của chỗ trống (`data-founderai-form-slot="booking"`), PHẢI bằng
 * `FORM_SLOT_KINDS` của backend (`landingHtmlInjection.util.js`). Chỗ trống TRẦN (không giá trị) = `consult`.
 */
export const FORM_SLOT_KINDS = Object.freeze(['consult', 'booking', 'payment', 'survey', 'blank']);

/**
 * Thuộc tính `data-founderai-form-slot[=giá trị]` trong thẻ mở. Cùng ý với bản backend nhưng KHÔNG dùng lookbehind
 * (`(?<!…)`): Safari < 16.4 không hiểu và báo SyntaxError làm hỏng cả module — thay bằng tiền tố `(?:^|[\s"'/])`.
 */
const FORM_SLOT_ATTR_VALUE_RE = /(?:^|[\s"'/])data-founderai-form-slot(?![\w-])(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/i;

/**
 * Đọc loại của MỘT chỗ trống từ chuỗi khớp FORM_SLOT_RE (cùng quy tắc với backend `parseFormSlotKind`).
 *
 * @param {string} slotHtml
 * @returns {{ kind: string, rawKind: string|null, bare: boolean, valid: boolean }}
 *   `bare`: không giá trị (trần) → `kind='consult'`. `valid=false`: giá trị ngoài FORM_SLOT_KINDS (backend sẽ từ chối khi lưu).
 */
export function parseFormSlotKind(slotHtml) {
  const openTag = String(slotHtml ?? '').match(/^<div\b[^>]*>/i)?.[0] || '';
  const attr = openTag.match(FORM_SLOT_ATTR_VALUE_RE);
  const rawValue = attr ? (attr[1] ?? attr[2] ?? attr[3] ?? '') : '';
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) return { kind: 'consult', rawKind: null, bare: true, valid: true };
  if (FORM_SLOT_KINDS.includes(normalized)) return { kind: normalized, rawKind: rawValue.trim(), bare: false, valid: true };
  return { kind: 'consult', rawKind: rawValue.trim(), bare: false, valid: false };
}

/**
 * PR-6 — mọi chỗ trống hợp lệ DẠNG trong HTML theo thứ tự xuất hiện, kèm vị trí ký tự và loại.
 *
 * @param {string} html
 * @returns {Array<{ type: 'slot', start: number, end: number, text: string, kind: string, rawKind: string|null, bare: boolean, valid: boolean }>}
 */
export function listFormSlotMatches(html) {
  return [...String(html ?? '').matchAll(FORM_SLOT_RE)].map((m) => ({
    type: 'slot',
    start: m.index,
    end: m.index + m[0].length,
    text: m[0],
    ...parseFormSlotKind(m[0]),
  }));
}

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
 * PR-6: chỗ trống có LOẠI tường minh hiện đúng loại — `kindHints[kind]` (vd "Biểu mẫu đặt lịch hẹn sẽ hiện ở đây sau khi lưu")
 * nếu có, không thì dùng `hintText` chung. Chỗ trống TRẦN và loại lạ (sai dạng) luôn dùng `hintText` chung.
 *
 * @param {string} html
 * @param {string} hintText Chữ hiển thị trong khung — nên truyền từ i18n (vi/en)
 * @param {Record<string, string>} [kindHints] chữ theo loại (consult/booking/payment/survey/blank) — nên truyền từ i18n
 * @returns {string}
 */
export function injectFormSlotPreviewHint(html, hintText, kindHints) {
  const source = String(html ?? '');
  if (!source) return source;
  const fallback = hintText || 'Biểu mẫu đăng ký sẽ hiện ở đây sau khi lưu';
  return source.replace(FORM_SLOT_RE, (match) => {
    const { kind, valid, bare } = parseFormSlotKind(match);
    // Chỗ trống TRẦN giữ chữ chung (đúng như trước PR-6: "Biểu mẫu đăng ký sẽ hiện ở đây…"); chỉ chỗ trống có LOẠI tường minh
    // mới hiện chữ theo loại.
    const text = escapeHtmlText((valid && !bare && kindHints && kindHints[kind]) || fallback);
    return (
      `<div style="border:2px dashed #f97316;border-radius:12px;padding:32px 16px;` +
      `text-align:center;color:#f97316;background:#fff7ed;font-family:system-ui,sans-serif;` +
      `font-size:14px;">${text}</div>`
    );
  });
}
