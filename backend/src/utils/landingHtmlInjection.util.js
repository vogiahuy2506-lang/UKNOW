/**
 * Gỡ các khối do hệ thống tự chèn trước đó (idempotent giữa các lần lưu).
 *
 * Từ v2.0:
 *   - KHÔNG tự strip `<section data-founder-lp-embed>` nữa. Admin tự xóa iframe
 *     là xóa hẳn, hệ thống không chèn lại.
 *   - Chỉ strip `<div data-founder-lp-injected>` + 2 script tracking (để chèn lại
 *     với slug/api-base mới ở `injectLandingEnhancements`).
 *
 * @param {string} html
 * @returns {string}
 */

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
 *   1. Gỡ khối script cũ (idempotent giữa các lần save).
 *   2. Rewrite link tracking trên `<a href>`.
 *   3. Chèn lại `lp-track.js` + `founderai-capture.js` (auto mode) để bắt form admin
 *      tự thiết kế và tracking click. KHÔNG auto-inject iframe form nữa — admin
 *      tự thiết kế `<form data-founderai-capture>` trong trang (khuyên dùng), hoặc
 *      để auto mode tự bắt form đầu tiên CÓ input email/phone/tel/phoneNumber.
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
 * (DEPRECATED — không auto-inject iframe nữa từ v2.0)
 *
 * Hàm này trước đây tự động chèn `<iframe src="/embed/lead-form?slug=...">` khi HTML
 * landing page không có sẵn form đăng ký. Đã bị gỡ khỏi `prepareLandingHtmlOnSave`
 * vì nhiều khách hàng thiết kế form riêng (multi-step, custom UI…) và không muốn
 * hệ thống tự chèn iframe đè lên.
 *
 * Nếu admin muốn có form đăng ký chuẩn của hệ thống, họ có thể:
 *   1. Tự thiết kế form với `<form data-founderai-capture>` (khuyên dùng — luôn
 *      thắng auto mode, không phụ thuộc form đó có trường gì).
 *   2. Hoặc không gắn thẻ gì cả — auto mode sẽ tự bắt form đầu tiên trong trang
 *      CÓ input name thuộc email/phone/tel/phoneNumber (founderai-capture.js,
 *      hàm pickAutoCaptureForm). Không có snippet dựng sẵn nào để copy nữa.
 *
 * Giữ export để tương thích ngược với code khác nếu có import, nhưng không gọi
 * nữa trong pipeline chính.
 *
 * @param {string} html
 * @param {{ slug?: string, frontendOrigin?: string }} [_opts]
 * @returns {string} HTML truyền vào, không thay đổi
 */
export function autoInjectLeadFormIfMissing(html, _opts = {}) {
  return String(html ?? '');
}

/**
 * Bổ sung script tracking vào chuỗi HTML (iframe form không tự chèn — admin copy từ CMS).
 *
 * Luồng:
 * 1. Nếu HTML đã có marker `data-founder-lp-injected` thì bỏ qua toàn bộ (tránh lặp).
 * 2. Nếu đã có `lp-track.js` và `founderai-capture.js` thì không chèn script trùng.
 * 3. Chèn thẻ script `lp-track.js` + `founderai-capture.js` (defer) với `data-api-base` + `data-slug` trước `</body>`.
 *
 * @param {string} html
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} opts.frontendOrigin Gốc frontend (vd http://localhost:5174) — host file `lp-track.js`, `founderai-capture.js`
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

  const lpTrackSrc = `${origin}/lp-track.js`;
  const captureSrc = `${origin}/founderai-capture.js`;

  const hasTrackScript = /lp-track\.js/i.test(out);
  const hasCaptureScript = /founderai-capture\.js/i.test(out);

  let scriptBlock = '';
  if (!hasTrackScript) {
    scriptBlock += `<script src="${lpTrackSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;
  }
  if (!hasCaptureScript) {
    scriptBlock += `<script src="${captureSrc}" data-api-base="${api}" data-slug="${s}" defer></script>\n`;
  }

  if (!scriptBlock) return out;

  const injectBlock = `<div data-founder-lp-injected="1" style="display:none" aria-hidden="true"></div>\n${scriptBlock}`;

  if (/<\/body>/i.test(out)) {
    return out.replace(/<\/body>/i, `${injectBlock}</body>`);
  }
  if (/<\/html>/i.test(out)) {
    return out.replace(/<\/html>/i, `${injectBlock}</html>`);
  }
  return `${out}\n${injectBlock}`;
}

export function stripFounderLandingAutoBlocks(html) {
  let out = String(html ?? '');
  out = out.replace(/<div\s[^>]*data-founder-lp-injected\s*=[^>]*>[\s\S]*?<\/div>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/<script\s[^>]*lp-track\.js[^>]*\/>\s*/gi, '');
  out = out.replace(/<script\s[^>]*founderai-capture\.js[^>]*>\s*<\/script>\s*/gi, '');
  out = out.replace(/<script\s[^>]*founderai-capture\.js[^>]*\/>\s*/gi, '');
  // Strip iframe cũ do admin từng paste từ Lead Form Config — không auto-inject nữa từ v2.0.
  // CHỈ strip khi trang đã có <form khác (đường thu lead thay thế) — trang CHỈ có iframe
  // (chưa có form nào khác) thì GIỮ NGUYÊN: strip vô điều kiện từng khiến 7 trang production
  // (3 khách thật) mất iframe — cách thu lead DUY NHẤT của trang — trong im lặng chỉ vì admin
  // sửa 1 chữ rồi Lưu (Hệ quả 6, PLAN_FORM_LANDING_AI_GIU_FORM_2026-09-06.md CẬP NHẬT 08/09
  // 17:30). Chốt guard /embed/lead-form ở landingEditGuard.util.js chỉ canh đường AI-edit,
  // không canh đường save thường này.
  if (/<form[\s>]/i.test(out)) {
    out = out.replace(/<iframe[^>]*embed\/lead.?form[^>]*>[\s\S]*?<\/iframe>\s*/gi, '');
    out = out.replace(/<iframe[^>]*embed\/lead.?form[^>]*\/?>\s*/gi, '');
  } else if (/<iframe[^>]*embed\/lead.?form[^>]*/i.test(out)) {
    console.log('[landingHtmlInjection] Giữ iframe /embed/lead-form vì trang chưa có <form nào khác để thu lead.');
  }
  return out;
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

/**
 * PR-5b-2a — chỗ trống AI đặt trong HTML khi `AI_LANDING_FORM_MODE=form` (khác hợp đồng khối
 * nhúng CỐ ĐỊNH ở `buildFormEmbedSectionHtml` bên dưới — chỗ trống chỉ tồn tại TẠM THỜI, từ lúc
 * AI trả HTML tới lúc lưu landing).
 *
 * Review PR-5b-2a nợ 1 (15/09): bản đầu chỉ khớp ĐÚNG `<div data-founderai-form-slot></div>`
 * không thuộc tính khác — AI thêm `class` cho đẹp, hoặc admin dán tay
 * `data-founderai-form-slot=""` (một cách viết HTML hợp lệ hoàn toàn bình thường) đều KHÔNG khớp,
 * và hậu quả không phải báo lỗi mà là ÂM THẦM lưu nguyên cái div rỗng vào landing, không tạo form
 * nào — trang publish với một khoảng trống câm. Regex giờ chấp nhận: thêm thuộc tính khác trước/
 * sau (`[^>]*`), giá trị thuộc tính viết dưới mọi dạng (`data-founderai-form-slot`, `="…"`,
 * `='…'`), khoảng trắng/xuống dòng bên trong div. VẪN không chấp nhận nội dung con thật (element/
 * text khác khoảng trắng) — `hasMalformedFormSlot` bên dưới bắt riêng ca này để báo lỗi rõ thay vì
 * lặng lẽ bỏ qua.
 *
 * PR-5b-2c (review 16/09, probe với hàm thật) — chú thích HTML `<!--…-->` bên trong chỗ trống giờ
 * coi như khoảng trắng (khớp hợp lệ): admin/AI đôi khi để lại `<!-- TODO -->` bên trong lúc soạn
 * tay, trước đây bị đếm là "sai dạng" (có nội dung con) dù không có gì thật sự hiển thị.
 */
const FORM_SLOT_RE = /<div\b[^>]*\bdata-founderai-form-slot\b(?:=(?:"[^"]*"|'[^']*'))?[^>]*>(?:\s|<!--[\s\S]*?-->)*<\/div>/gi;

/**
 * Mọi thẻ mở HTML có nhắc tên thuộc tính (`<div data-founderai-form-slot ...>`, bất kỳ tên thẻ,
 * không phân biệt hoa/thường) — dùng để so với số chỗ trống HỢP LỆ đếm được, lệch nghĩa là có thẻ
 * mang thuộc tính này nhưng không khớp dạng hợp lệ (`hasMalformedFormSlot`).
 *
 * PR-5b-2c (review 16/09, probe 16/09) sửa 2 lỗ:
 *   1. Thiếu cờ `i` — `<div DATA-FOUNDERAI-FORM-SLOT><p>x</p></div>` (HTML không phân biệt hoa
 *      thường ở tên thuộc tính) không được đếm là "nhắc tên" nên không bị phát hiện sai dạng,
 *      lưu nguyên cả thuộc tính lẫn nội dung con vào DB.
 *   2. Đếm cả bên NGOÀI thẻ — chuỗi `[data-founderai-form-slot]` làm bộ chọn CSS trong `<style>`
 *      (một cách hợp lệ để admin tự style chỗ trống trước khi lưu) bị tính là một "nhắc tên" thừa,
 *      khiến trang có ĐÚNG 1 chỗ trống hợp lệ vẫn bị báo sai dạng. Giới hạn khớp bên TRONG một thẻ
 *      mở thật (`<chữ cái...`) loại cả CSS lẫn chú thích (`<!--` không khớp `<[a-z]`).
 */
const FORM_SLOT_ATTR_MENTION_RE = /<[a-z][^>]*\bdata-founderai-form-slot\b/gi;

/**
 * Đếm số chỗ trống biểu mẫu HỢP LỆ (`<div …data-founderai-form-slot…></div>`, không nội dung con)
 * trong một đoạn HTML. Dùng cả ở chốt chặn sau khi AI sinh (đúng 1) lẫn lúc lưu landing (0/1 hợp
 * lệ, ≥2 → 400) — logic đếm PHẢI giống nhau ở cả hai nơi, nên đặt một chỗ duy nhất.
 *
 * @param {string} html
 * @returns {number}
 */
export function countFormSlots(html) {
  const matches = String(html || '').match(FORM_SLOT_RE);
  return matches ? matches.length : 0;
}

/**
 * PR-5b-2a nợ 1 — có div mang thuộc tính `data-founderai-form-slot` nhưng KHÔNG khớp dạng hợp lệ
 * (ví dụ có nội dung con thật: `<div data-founderai-form-slot><p>x</p></div>`) hay không. So số
 * lần chuỗi nhắc tên thuộc tính với số chỗ trống hợp lệ đếm được — lệch (nhắc nhiều hơn hợp lệ)
 * nghĩa là có ít nhất một div hỏng dạng. Không phải HTML parser thật (không cần cho phạm vi này —
 * chỉ AI sinh hoặc admin dán tay một khối đơn giản), chỉ đủ để KHÔNG lặng lẽ bỏ qua như nợ 1.
 *
 * @param {string} html
 * @returns {boolean}
 */
export function hasMalformedFormSlot(html) {
  const source = String(html || '');
  const mentionCount = (source.match(FORM_SLOT_ATTR_MENTION_RE) || []).length;
  return mentionCount > countFormSlots(source);
}

/**
 * Thay ĐÚNG MỘT chỗ trống biểu mẫu bằng đoạn HTML khác (khối nhúng thật). Gọi ĐÚNG MỘT lần
 * `.replace` (không global) — caller phải tự đảm bảo `countFormSlots(html) === 1` trước khi gọi
 * (kiểm ở landingPageAdmin.service.js, không lặp lại điều kiện ở đây).
 *
 * @param {string} html
 * @param {string} replacementHtml
 * @returns {string}
 */
export function replaceFormSlotWithEmbed(html, replacementHtml) {
  return String(html || '').replace(FORM_SLOT_RE, () => String(replacementHtml || ''));
}

/**
 * Hợp đồng khối nhúng Biểu mẫu CỐ ĐỊNH (PR-5, `PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md`) —
 * PHẢI khớp byte-for-byte với bản frontend ở `ShareModal.jsx` (`embedCode`) và được
 * `form-embed.js` + `extractFormEmbedKeys` (`landingEditGuard.util.js`) nhận diện đúng. `origin`
 * TUYỆT ĐỐI — landing chạy trên subdomain/tên miền riêng của khách, không cùng origin với app.
 *
 * @param {{ publicKey: string, origin: string, fallbackText?: string }} params
 * @returns {string}
 */
export function buildFormEmbedSectionHtml({ publicKey, origin, fallbackText = 'Mở biểu mẫu' }) {
  const org = String(origin || '').replace(/\/+$/, '');
  const key = String(publicKey || '');
  return `<section data-founderai-form-section>
  <div data-founderai-form="${key}"></div>
  <noscript><a href="${org}/f/${key}">${fallbackText}</a></noscript>
  <script src="${org}/form-embed.js" defer></script>
</section>`;
}
