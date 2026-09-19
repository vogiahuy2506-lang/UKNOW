/**
 * Render HTML email cho notification — SERVER-SIDE AUTHORITATIVE.
 *
 * TRIẾT LÝ (sau rewrite 19/09/2026):
 *  - `html_content` là NỘI DUNG EMAIL TUYỆT ĐỐI — không bọc thêm greeting, title box,
 *    message box, user chip, footer cố định. Admin soạn gì trong phần "Soạn mẫu HTML"
 *    (textarea Rich Text / code editor) thì người nhận sẽ nhận đúng y.
 *  - Nếu `html_content` rỗng → dùng `message` (plain text), wrap tối thiểu trong
 *    <body> để hiển thị được trong email client.
 *  - Preview trong FE iframe dùng cùng hàm này → "soạn xong = gửi đi = nhận được"
 *    (WYSIWYG email).
 *
 * LÝ DO VIẾT LẠI:
 *  - Trước đây renderer bọc `html_content` trong 1 lớp layout cố định gồm:
 *    header gradient, greeting, title box, message box, user chip, footer.
 *    → Admin soạn template ở "Soạn mẫu" nhưng email gửi đi khác hẳn preview.
 *    → User phản ánh "mail bị gói gọn trong phần nội dung".
 *  - Rewrite: `html_content` là BODY EMAIL. Chỉ thêm DOCTYPE + <html> wrapper
 *    tối thiểu để email client render được. Không có lớp layout nào bọc ngoài.
 *
 * PIPELINE:
 *  1. Nếu có `html_content`:
 *       (a) replaceVariables(html_content, user)  — thay {{user_name}} etc.
 *       (b) sanitizeEmailHtml()                   — strip <style>, <script>, on*=, style=
 *       (c) gói trong <html><body> tối thiểu
 *  2. Nếu không có `html_content`:
 *       (a) escapeHtml(message)                    — plain text an toàn
 *       (b) gói trong <html><body> tối thiểu
 *
 * VARIABLE REPLACEMENT:
 *  - {{user_name}}     → user.full_name || user.username || 'bạn'
 *  - {{user_email}}    → user.email || ''
 *  - {{user_plan}}     → user.plan || 'Miễn phí'
 *  - {{product_name}}  → MAIL_FROM_NAME
 *  - {{current_date}}  → DD/MM/YYYY
 *  - {{dashboard_url}} → FRONTEND_URL
 *  - {{support_email}} → SUPPORT_EMAIL
 *
 * EMAIL CLIENT COMPATIBILITY (Gmail/Outlook):
 *  - Inline CSS only — mọi <style> block bị strip.
 *  - Fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
 *  - Max-width 680px, responsive via viewport meta.
 *  - Inline max-width on wrapping table/div để không vỡ trên mobile.
 *
 * ĐỒNG BỘ: hàm này là DUY NHẤT — không còn file util FE riêng render email.
 * FE iframe preview gọi BE /preview-email-html endpoint → nhận HTML từ hàm này.
 */

const MAIL_FROM_NAME  = process.env.MAIL_FROM_NAME  || 'Founder AI Platform';
const SUPPORT_EMAIL   = process.env.SUPPORT_EMAIL   || 'info@digiso.vn';
const FRONTEND_URL    = process.env.FRONTEND_URL    || 'https://founderai.vn';

// -------------------------------------------------------------------
// Variable replacement
// -------------------------------------------------------------------

/**
 * Thay {{var}} bằng giá trị user.
 * @param {string} content
 * @param {Object|null} user
 * @returns {string}
 */
export function replaceVariablesForUser(content, user) {
  if (!content) return '';
  const u = user || {};
  return String(content)
    .replace(/\{\{user_name\}\}/g,     u.full_name || u.username || 'bạn')
    .replace(/\{\{user_email\}\}/g,    u.email     || '')
    .replace(/\{\{user_plan\}\}/g,     u.plan      || 'Miễn phí')
    .replace(/\{\{product_name\}\}/g,  MAIL_FROM_NAME)
    .replace(/\{\{current_date\}\}/g,  new Date().toLocaleDateString('vi-VN'))
    .replace(/\{\{dashboard_url\}\}/g, FRONTEND_URL)
    .replace(/\{\{support_email\}\}/g, SUPPORT_EMAIL);
}

// -------------------------------------------------------------------
// HTML helpers
// -------------------------------------------------------------------

/** Escape text để chèn an toàn vào HTML. */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// -------------------------------------------------------------------
// Document wrapper strip
// -------------------------------------------------------------------

/**
 * Bóc `<!DOCTYPE>`, `<html>`, `<head>`, `<body>` wrapper khỏi HTML admin paste.
 *
 * Admin "Save As Template" copy nguyên 1 document HTML vào `html_content`.
 * Nếu giữ nguyên → renderer bọc vào "Message Box" nhỏ → layout vỡ.
 * Fix: trích nội dung body (hoặc fallback giữa <html>...</html> nếu không có body).
 *
 * @param {string} raw
 * @returns {string}
 */
function stripDocumentWrapper(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';

  // Bỏ DOCTYPE
  s = s.replace(/<!DOCTYPE[^>]*>/gi, '').trim();

  // Bóc trong <html>...</html>
  const htmlBlock = s.match(/<html\b[^>]*>([\s\S]*?)<\/html>/i);
  if (htmlBlock) s = htmlBlock[1];

  // Bỏ <head>...</head> NHƯNG giữ <style> block bên trong admin paste.
  // Admin dán document HTML đầy đủ (MIXML-style) → trong <head> thường có
  // <style> chứa CSS của email template. Strip <style> thì admin mất CSS
  // ngay cả khi admin muốn giữ. Phương án: bóc <head>...</head> ra khỏi
  // s, trích <style>...</style> ra, dán TRƯỚC body content ở cuối cùng.
  const headBlocks = [...s.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head>/gi)];
  let headStyles = '';
  for (const m of headBlocks) {
    const styleBlocks = [...m[1].matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
    for (const sm of styleBlocks) headStyles += sm[0];
  }
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

  // Bóc trong <body>...</body>
  const bodyBlock = s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyBlock) {
    s = bodyBlock[1];
  }

  // Ghép <style> đã trích từ <head> trước body content
  if (headStyles) {
    s = headStyles + s;
  }

  return s.trim();
}

// -------------------------------------------------------------------
// Sanitizer
// -------------------------------------------------------------------

/**
 * Sanitize HTML admin soạn trong `html_content`.
 *
 * TRIẾT LÝ (sau feedback 19/09):
 *  - Admin paste nguyên template từ editor HTML (MIXML/CKEditor/HTML email builder).
 *  - Email client (Gmail/Outlook) render GIỚI HẠN:
 *      + Được: inline `style=""`, <style> block (không ổn định), <table>, <img>,
 *        <a href="">, mọi <div>/<span>/<p>/<h*>/<strong>/...
 *      + KHÔNG được: <script>, <iframe>, <object>, <embed>, <form>, event handler
 *        on*=, javascript: scheme.
 *  - Phải GIỮ <style> + style="" để layout admin paste còn hoạt động. Strip
 *    style="..." sẽ phá layout của mọi template email designer tạo ra.
 *
 * QUY TẮC (regex-based, best-effort cho email):
 *  1. Strip document wrapper (xem stripDocumentWrapper).
 *  2. Strip thẻ nguy hiểm THỰC SỰ: script, iframe, object, embed, form, slot.
 *     GIỮ: <style>, <link> (CSS import), <meta> (charset).
 *  3. Strip attribute on*= (event handler).
 *  4. GIỮ style="" — email client cần inline CSS.
 *  5. Tag whitelist mở rộng: p, br, strong, b, em, i, u, s, ul, ol, li, h1-h6,
 *     blockquote, code, pre, kbd, samp, a, span, div, img, figure, figcaption,
 *     table, thead, tbody, tfoot, tr, th, td, hr, small, sup, sub, abbr, cite,
 *     style, link, meta.
 *  6. Thẻ <a>: chỉ giữ href (http(s)/mailto/tel) + target=_blank + rel.
 *  7. Thẻ <img>: chỉ giữ src + alt + width/height (validated scheme).
 *  8. Strip HTML comment.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitizeEmailHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let out = stripDocumentWrapper(raw);
  if (!out) return '';

  // 1. Strip THẺ NGUY HIỂM thực sự (email client không render):
  //    - script: code execution
  //    - iframe/object/embed/form: phishing, embedded content
  //    - slot: web components (không có ý nghĩa trong email)
  // GIỮ: <style>, <link>, <meta> — admin paste template CSS cần giữ.
  const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'slot'];
  for (const tag of DANGEROUS_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 2. Strip on* event handler attributes (bất kể ở thẻ nào)
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');

  // 3. GIỮ style="" — email client render inline CSS.
  //    KHÔNG strip.

  // 4. Whitelist tags + attribute cleanup. Mọi thẻ ngoài whitelist → strip.
  const ALLOWED = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre', 'kbd', 'samp',
    'a', 'span', 'div',
    'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'hr', 'small', 'sup', 'sub', 'abbr', 'cite',
    'style', 'link', 'meta', 'title', 'head', 'html' // email client có thể có
  ]);

  out = out.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (_whole, tagName, rest) => {
    const tag = String(tagName || '').toLowerCase();
    const isClose = _whole.startsWith('</');

    if (DANGEROUS_TAGS.includes(tag)) return '';
    if (!ALLOWED.has(tag)) return '';

    if (isClose) return `</${tag}>`;

    if (tag === 'br') return '<br>';

    if (tag === 'a') {
      const hrefMatch =
        rest.match(/\bhref\s*=\s*"([^"]*)"/i) ||
        rest.match(/\bhref\s*=\s*'([^']*)'/i) ||
        rest.match(/\bhref\s*=\s*([^\s>]+)/i);
      let href = hrefMatch ? hrefMatch[1] : '';
      let safeHref = '';
      try {
        const t = String(href || '').trim();
        if (t && /^(?:https?:|mailto:|tel:)/i.test(t)) {
          safeHref = t.replace(/"/g, '&quot;');
        }
      } catch { /* noop */ }
      return safeHref
        ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`
        : '<a>';
    }

    if (tag === 'img') {
      // Giữ src (validated) + alt + width/height + style + class (vì email client
      // cần inline CSS — admin paste template có thể có class).
      const srcMatch =
        rest.match(/\bsrc\s*=\s*"([^"]*)"/i) ||
        rest.match(/\bsrc\s*=\s*'([^']*)'/i) ||
        rest.match(/\bsrc\s*=\s*([^\s>]+)/i);
      const altMatch =
        rest.match(/\balt\s*=\s*"([^"]*)"/i) ||
        rest.match(/\balt\s*=\s*'([^']*)'/i) ||
        rest.match(/\balt\s*=\s*([^\s>]+)/i);
      const wMatch  = rest.match(/\bwidth\s*=\s*"([^"]*)"/i) || rest.match(/\bwidth\s*=\s*([^\s>]+)/i);
      const hMatch  = rest.match(/\bheight\s*=\s*"([^"]*)"/i) || rest.match(/\bheight\s*=\s*([^\s>]+)/i);
      const styleMatch = rest.match(/\bstyle\s*=\s*"([^"]*)"/i) || rest.match(/\bstyle\s*=\s*'([^']*)'/i);
      let attrs = '';
      if (srcMatch) {
        const src = String(srcMatch[1]).trim().replace(/"/g, '&quot;');
        if (/^(?:https?:|data:image)/i.test(src)) {
          attrs += ` src="${src}"`;
        }
      }
      if (altMatch)   attrs += ` alt="${String(altMatch[1]).replace(/"/g, '&quot;')}"`;
      if (wMatch)     attrs += ` width="${String(wMatch[1]).replace(/[^0-9%]/g, '')}"`;
      if (hMatch)     attrs += ` height="${String(hMatch[1]).replace(/[^0-9%]/g, '')}"`;
      if (styleMatch) attrs += ` style="${String(styleMatch[1]).replace(/"/g, '&quot;')}"`;
      return attrs ? `<img${attrs}>` : '';
    }

    // Thẻ whitelisted khác (div, p, table, tr, td, span, h1-h6, ...): GIỮ style
    // + class + id (admin cần cho layout email + span hooks).
    // Lấy lại style + class + id, bỏ các attribute khác.
    const styleAttr = (rest.match(/\bstyle\s*=\s*"([^"]*)"/i) || rest.match(/\bstyle\s*=\s*'([^']*)'/i));
    const classAttr = (rest.match(/\bclass\s*=\s*"([^"]*)"/i) || rest.match(/\bclass\s*=\s*'([^']*)'/i));
    const idAttr    = (rest.match(/\bid\s*=\s*"([^"]*)"/i)    || rest.match(/\bid\s*=\s*'([^']*)'/i));
    const colspan   = (rest.match(/\bcolspan\s*=\s*"([^"]*)"/i) || rest.match(/\bcolspan\s*=\s*'([^']*)'/i) || rest.match(/\bcolspan\s*=\s*([^\s>]+)/i));
    let attrs = '';
    if (styleAttr) attrs += ` style="${String(styleAttr[1]).replace(/"/g, '&quot;')}"`;
    if (classAttr) attrs += ` class="${String(classAttr[1]).replace(/"/g, '&quot;')}"`;
    if (idAttr)    attrs += ` id="${String(idAttr[1]).replace(/"/g, '&quot;')}"`;
    if (colspan && (tag === 'th' || tag === 'td')) {
      const v = String(colspan[1]).replace(/[^0-9]/g, '');
      if (v) attrs += ` colspan="${v}"`;
    }
    return `<${tag}${attrs}>`;
  });

  // 5. Strip HTML comments (admin có thể có để ghi chú, nhưng comment có thể chứa
  //    conditional comments Outlook — tuy nhiên an toàn hơn nếu strip vì có thể
  //    leak tracker).
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  return out.trim();
}

// -------------------------------------------------------------------
// Main renderer
// -------------------------------------------------------------------

/**
 * Render email HTML từ notification.
 *
 * TRIẾT LÝ (rewrite 19/09 push 40e3a671):
 *  - `html_content` là BODY EMAIL TUYỆT ĐỐI — không bọc layout, không footer.
 *  - Chỉ giữ <!DOCTYPE> + <html> + <head> + <body> với CSS reset tối thiểu
 *    (margin:0, font-family). Admin soạn gì → user nhận đúng y.
 *
 * THAY ĐỔI LẦN NÀY (sau feedback mail lộ raw + footer cố định):
 *  - KHÔNG còn <table> wrapper, padding, background, border-radius, footer.
 *  - Sanitizer GIỮ inline CSS (style="...") vì email client CHỈ render inline
 *    CSS. Nếu strip thì layout admin paste vỡ.
 *  - KHÔNG strip <style> block: admin có thể paste CSS từ template designer
 *    (MIXML/Mailchimp-style). Chỉ strip thẻ nguy hiểm thực sự (script, iframe,
 *    object, embed, form) + on*= event handler.
 *
 * PIPELINE:
 *  1. Nếu html_content:
 *       (a) replaceVariables(html_content, user)
 *       (b) sanitize: strip thẻ nguy hiểm + on*= handler (GIỮ style=, <style>)
 *       (c) gói trong <!DOCTYPE html><body> tối thiểu + font-family system
 *  2. Nếu không có html_content:
 *       (a) escapeHtml(message)
 *       (b) wrap trong <p> tối thiểu
 *
 * @param {Object} input
 * @param {Object}        input.notification  - { type, priority, title, message, html_content }
 * @param {Object|null}  input.user          - user nhận (null cho preview)
 * @param {'vi'|'en'}    [input.locale='vi']
 * @returns {string} HTML đầy đủ <!DOCTYPE html>...
 */
export function renderNotificationEmailHtml({ notification, user = null, locale = 'vi' }) {
  const n = notification || {};

  // Sample user: preview defaults + real user fields
  const u = user || {
    full_name: 'Nguyễn Văn Test',
    username: 'testuser',
    email: 'test@example.com',
    plan: 'pro'
  };

  // ----------------------------------------------------------------
  // Body content — quyết định đường nào dựa trên data có sẵn.
  // ----------------------------------------------------------------
  //
  // ƯU TIÊN:
  //   1. html_content (đường chính — admin soạn HTML, push 5c70085a tách riêng)
  //   2. message có chứa HTML tag recognized (BACKWARD COMPAT: data cũ trước
  //      push 5c70085a, FE buildPayload cũ chưa tách html_content nên nhét HTML
  //      vào column `message` — renderer tự detect để không phá data cũ)
  //   3. Plain text fallback (escape + wrap <p>)
  //
  // Heuristic BACKWARD: match nguyên 1 thẻ HTML trong whitelist của sanitizer.
  // Tránh false-positive với text kiểu 'price <symbol>' hay 'use < bằng'.
  let bodyHtml;
  let htmlSource = null;

  if (n.html_content && typeof n.html_content === 'string' && n.html_content.trim() !== '') {
    htmlSource = n.html_content;
  } else if (n.message && typeof n.message === 'string') {
    const htmlTagRegex = /<\/?(?:p|br|strong|b|em|i|u|s|del|ins|ul|ol|li|h[1-6]|blockquote|code|pre|kbd|samp|a|span|div|img|figure|figcaption|table|thead|tbody|tfoot|tr|th|td|hr|small|sup|sub|abbr|cite|style|link|meta|html|head|body|script|iframe|form|button|input|label|select|option|textarea|nav|header|footer|main|section|article|aside|figure|picture|video|audio|source|svg|canvas)\b[^>]*>/i;
    if (htmlTagRegex.test(n.message)) {
      htmlSource = n.message; // BACKWARD: notification cũ chứa HTML trong `message`
    }
  }

  if (htmlSource !== null) {
    // Pipeline HTML: replace {{var}} → sanitize (giữ style, <style>; strip
    // thẻ nguy hiểm + on*=). Xem chi tiết trong sanitizeEmailHtml JSDoc.
    const raw = replaceVariablesForUser(htmlSource, u);
    bodyHtml = sanitizeEmailHtml(raw);
  } else {
    // Plain text: escape + wrap <p>.
    const raw = replaceVariablesForUser(n.message || '', u);
    bodyHtml = `<p style="margin:0 0 12px;">${escapeHtml(raw)}</p>`;
  }

  // Nếu sau sanitize bodyHtml rỗng → fallback message
  if (!bodyHtml) {
    const fallback = escapeHtml(n.message || '');
    bodyHtml = `<p style="margin:0 0 12px;">${fallback}</p>`;
  }

  // ----------------------------------------------------------------
  // Build full document — MINIMAL wrapper, không layout, không footer.
  // ----------------------------------------------------------------
  const lang = locale === 'en' ? 'en' : 'vi';

  // System font stack + reset margin/body để admin soạn HTML hoàn toàn tự do.
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(MAIL_FROM_NAME)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
${bodyHtml}
</body>
</html>`;
}

export default renderNotificationEmailHtml;
