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

  // Bỏ <head>...</head>
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

  // Bóc trong <body>...</body>
  const bodyBlock = s.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyBlock) s = bodyBlock[1];

  return s.trim();
}

// -------------------------------------------------------------------
// Sanitizer
// -------------------------------------------------------------------

/**
 * Sanitize HTML admin soạn trong `html_content`.
 *
 * QUY TẮC (regex-based, best-effort cho email):
 *  1. Strip document wrapper (xem stripDocumentWrapper).
 *  2. Strip thẻ nguy hiểm: script, style, link, iframe, object, embed, form,
 *     meta, base, noscript, template, slot.
 *  3. Strip attribute on*= (event handler).
 *  4. Strip attribute style= (CSS injection; Gmail/Outlook bỏ inline CSS).
 *  5. Tag whitelist: p, br, strong, b, em, i, u, ul, ol, li, h1, h2, h3, h4,
 *     h5, h6, blockquote, code, pre, a, span, div, img, table, thead, tbody,
 *     tfoot, tr, th, td, hr, small.
 *  6. Thẻ <a>: chỉ giữ href (http(s)/mailto/tel) + target=_blank + rel.
 *  7. Thẻ <img>: chỉ giữ src + alt + width + height (nếu có).
 *  8. Strip HTML comment.
 *
 * @param {string} raw
 * @returns {string}
 */
function sanitizeEmailHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let out = stripDocumentWrapper(raw);
  if (!out) return '';

  // 1. Strip block tags
  const BLOCK_TAGS = [
    'script', 'style', 'link', 'iframe', 'object', 'embed', 'form',
    'meta', 'base', 'noscript', 'template', 'slot'
  ];
  for (const tag of BLOCK_TAGS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }

  // 2. Strip on* event attributes
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');

  // 3. Strip style= attributes
  out = out.replace(/\s+style\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\s+style\s*=\s*'[^']*'/gi, '');

  // 4. Whitelist tags + attribute cleanup
  const ALLOWED = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'code', 'pre', 'kbd', 'samp',
    'a', 'span', 'div',
    'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'hr', 'small', 'sup', 'sub', 'abbr', 'cite'
  ]);

  out = out.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (_whole, tagName, rest) => {
    const tag = String(tagName || '').toLowerCase();
    const isClose = _whole.startsWith('</');

    if (BLOCK_TAGS.includes(tag)) return '';
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
      // Chỉ giữ src + alt + width/height nếu hợp lệ
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
      let attrs = '';
      if (srcMatch) {
        const src = String(srcMatch[1]).trim().replace(/"/g, '&quot;');
        if (/^(?:https?:|data:image)/i.test(src)) {
          attrs += ` src="${src}"`;
        }
      }
      if (altMatch) attrs += ` alt="${String(altMatch[1]).replace(/"/g, '&quot;')}"`;
      if (wMatch)   attrs += ` width="${String(wMatch[1]).replace(/[^0-9]/g, '')}"`;
      if (hMatch)   attrs += ` height="${String(hMatch[1]).replace(/[^0-9]/g, '')}"`;
      return attrs ? `<img${attrs}>` : '';
    }

    // Các thẻ whitelisted khác: bỏ toàn bộ attributes, giữ thẻ sạch
    return `<${tag}>`;
  });

  // 5. Strip HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  return out.trim();
}

// -------------------------------------------------------------------
// Main renderer
// -------------------------------------------------------------------

/**
 * Render email HTML từ notification.
 *
 * TRIẾT LÝ: `html_content` là BODY EMAIL TUYỆT ĐỐI.
 * - Có `html_content` → sanitize → gói tối thiểu trong <html><body>.
 * - Không có `html_content` → escape(message) → gói tối thiểu.
 *
 * KHÔNG bọc thêm: header gradient, greeting, title box, message box,
 * user chip, footer cố định. Admin soạn gì → user nhận đúng y.
 *
 * @param {Object} input
 * @param {Object}        input.notification  - { type, priority, title, message, html_content, html_content_en }
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
  // Body content
  // ----------------------------------------------------------------
  let bodyHtml;

  if (n.html_content && typeof n.html_content === 'string' && n.html_content.trim() !== '') {
    // Đường HTML: admin soạn trong "Soạn mẫu HTML".
    // Pipeline: (1) replace {{var}} bằng user values → (2) sanitize.
    // Sau sanitize admin vẫn dùng được <p>/<strong>/<a>/<img>/<table> nhưng
    // KHÔNG có <style>, <script>, event handler, inline CSS.
    const raw = replaceVariablesForUser(n.html_content, u);
    bodyHtml = sanitizeEmailHtml(raw);
  } else {
    // Đường plain text: không có html_content → dùng message + escape.
    const raw = replaceVariablesForUser(n.message || '', u);
    bodyHtml = escapeHtml(raw);
  }

  // Nếu sau sanitize bodyHtml rỗng → fallback message
  if (!bodyHtml) {
    bodyHtml = `<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#374151;font-size:15px;line-height:1.7;margin:0;">${escapeHtml(n.message || '')}</p>`;
  }

  // ----------------------------------------------------------------
  // Build full document
  // ----------------------------------------------------------------
  const lang = locale === 'en' ? 'en' : 'vi';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="format-detection" content="telephone=no" />
  <title>${escapeHtml(MAIL_FROM_NAME)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table width="680" cellpadding="0" cellspacing="0" border="0"
               style="max-width:680px;width:100%;background:#ffffff;
                      border-radius:12px;overflow:hidden;
                      box-shadow:0 4px 16px rgba(0,0,0,.08);">
          <tr>
            <td style="padding:32px 36px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#9ca3af;">
                ${escapeHtml(SUPPORT_EMAIL)}
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#d1d5db;">
                <a href="${FRONTEND_URL}" style="color:#9ca3af;text-decoration:none;">${escapeHtml(MAIL_FROM_NAME)}</a>
                &nbsp;·&nbsp;
                <a href="${FRONTEND_URL}" style="color:#9ca3af;text-decoration:none;">${escapeHtml(FRONTEND_URL)}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export default renderNotificationEmailHtml;
