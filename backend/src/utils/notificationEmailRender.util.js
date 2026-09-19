/**
 * Render HTML email cho notification — server-side mirror của FE renderNotificationHtml.
 *
 * TẠI SAO CẦN FILE NÀY:
 *  - FE có `frontend/src/features/admin/utils/notificationPreview.util.js` để iframe preview.
 *  - BE có `notification.service.js#buildEmailHtml` để gửi email thật qua SMTP.
 *  - 2 chỗ này từng render layout KHÁC NHAU → admin soạn xong preview đẹp, khách nhận
 *    mail lại trông khác → user feedback "email phải y chang preview".
 *  - Hướng xử lý: BE expose endpoint /admin/notifications/preview-html trả về HTML y hệt
 *    email thật sẽ gửi. FE iframe dùng HTML đó → 1 nguồn sự thật duy nhất.
 *
 * GIỮ FRONTEND FILE RIÊNG:
 *  - FE vẫn có file util để render OFFLINE (không gọi network) cho những chỗ cần tức thì.
 *  - Layout trong file này khớp với FE util (cùng palette, cùng markup). Khi FE chuyển sang
 *    dùng BE API thì file FE có thể bị thu hồi hoặc giữ làm fallback.
 *
 * ĐỒNG BỘ: nếu đổi layout, đổi cả 2 chỗ (file này + FE util) để tránh lệch.
 *  - Palette: `BADGE_PALETTE` (file này) ↔ `BADGE_PALETTE` trong notificationPreview.util.js.
 *  - Brand: MAIL_FROM_NAME, SUPPORT_EMAIL, FRONTEND_URL — sync với FE constants.
 */

const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Founder AI Platform';
const SYSTEM_LOGO_URL = '/logo.png'; // FE public asset, BE không embed — email client load qua URL gốc của frontend.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'info@digiso.vn';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';

const BADGE_PALETTE = {
  maintenance: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  announcement: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  promotion: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  reminder: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  security: { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' }
};

const TYPE_LABELS_VI = {
  maintenance: 'Bảo trì',
  announcement: 'Thông báo',
  promotion: 'Khuyến mãi',
  warning: 'Cảnh báo',
  reminder: 'Nhắc nhở',
  security: 'Bảo mật'
};

const TYPE_LABELS_EN = {
  maintenance: 'Maintenance',
  announcement: 'Announcement',
  promotion: 'Promotion',
  warning: 'Warning',
  reminder: 'Reminder',
  security: 'Security'
};

/**
 * Replace `{{var}}` với giá trị user. Khác với notification.service#replaceVariables:
 *  - Service chỉ thay 1 user (recipients). Ở đây thay 1 user cụ thể được truyền vào
 *    (preview thì dùng sampleUser).
 *  - Không escape — output sẽ đi vào HTML đã escape sẵn ở chỗ chèn.
 *
 * @param {string} content
 * @param {Object} user
 * @returns {string}
 */
export function replaceVariablesForUser(content, user) {
  if (!content) return '';
  const u = user || {};
  return String(content)
    .replace(/\{\{user_name\}\}/g, u.full_name || u.username || 'bạn')
    .replace(/\{\{user_email\}\}/g, u.email || '')
    .replace(/\{\{user_plan\}\}/g, u.plan || 'Miễn phí')
    .replace(/\{\{product_name\}\}/g, MAIL_FROM_NAME)
    .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('vi-VN'))
    .replace(/\{\{dashboard_url\}\}/g, FRONTEND_URL)
    .replace(/\{\{support_email\}\}/g, SUPPORT_EMAIL);
}

/**
 * Escape HTML để chèn text vào HTML an toàn.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render email HTML cho notification — layout khớp với FE renderNotificationHtml.
 * Đây là NGUỒN SỰ THẬT cho cả preview iframe lẫn email gửi đi (notification.service
 * sẽ dùng hàm này thay cho layout hardcoded cũ).
 *
 * @param {Object} input
 * @param {Object} input.notification - { type, priority, title, message, html_content }
 * @param {Object|null} input.user - user nhận (recipients) — null cho preview
 * @param {'vi'|'en'} [input.locale='vi']
 * @param {'desktop'|'mobile'} [input.device='desktop'] — chỉ áp dụng preview iframe, email thật luôn 'desktop'
 * @returns {string} HTML đầy đủ, sẵn để gán vào iframe srcDoc hoặc send qua SMTP
 */

/**
 * Sanitize HTML admin soạn trong `notification.html_content` trước khi chèn vào email.
 *
 * BỐI CẢNH (sau push 5b73c04c):
 *  - Admin "Save As Template" với body HTML. Trước renderer KHÔNG escape.
 *  - User gửi feedback email nhận được hiển thị raw `<style>` trong box — admin đã
 *    paste `<style>` từ layout mẫu vào `html_content`.
 *  - Email client (Gmail/Outlook) bỏ inline CSS ngoài thẻ `<style>` và bỏ cả
 *    attribute `style="..."` không phải từ CSP cho phép; layout vỡ.
 *
 * QUY TẮC (regex-based, best-effort cho email notification):
 *  1. STRIP tất cả nội dung thẻ nguy hiểm + thẻ tự đóng: `script`, `style`, `link`,
 *     `iframe`, `object`, `embed`, `form`, `meta`, `base`, `noscript`, `template`,
 *     `slot`.
 *  2. STRIP mọi attribute `on*=...` (event handler: onload/onclick/...).
 *  3. STRIP mọi attribute `style=...` (CSS injection + Gmail bỏ anyway).
 *  4. Tag whitelist: `p, br, strong, b, em, i, u, ul, ol, li, h2, h3, h4, blockquote,
 *     code, pre, a, span, div`. Thẻ khác (table, img, ...) → strip thẻ, giữ text.
 *  5. Thẻ `<a>`: chỉ giữ `href` với scheme http(s)/mailto/tel + `target=_blank` +
 *     `rel=noopener noreferrer`. Attribute khác bỏ.
 *  6. Strip HTML comment.
 *
 * LƯU Ý: Best-effort. Nếu admin nhập HTML quá phức tạp (nested table, layout grid)
 * sẽ mất. Tương lai nên thay bằng DOMPurify nếu cần bulletproof sanitizer.
 * Cũng KHÔNG xử lý `display:none`/`@import`/URL bypass — đó là giới hạn của regex.
 *
 * @param {string} rawHtml
 * @returns {string} HTML an toàn
 */
function sanitizeEmailHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';
  let out = String(rawHtml);

  // 1. Block-level strip: xóa cặp thẻ `<tag>...</tag>` (kèm self-closing).
  const STRIP_BLOCK_TAGS = [
    'script', 'style', 'link', 'iframe', 'object', 'embed', 'form',
    'meta', 'base', 'noscript', 'template', 'slot'
  ];
  for (const tag of STRIP_BLOCK_TAGS) {
    const reBlock = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(reBlock, '');
    // Self-closing form: <script src="..." /> hoặc <link ... />
    const reSelf = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    out = out.replace(reSelf, '');
  }

  // 2. Strip `on*` event handler attributes.
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '');

  // 3. Strip `style=...` attribute.
  out = out.replace(/\s+style\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\s+style\s*=\s*'[^']*'/gi, '');

  // 4. Walk qua từng thẻ: whitelist + attribute cleanup.
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li',
    'h2', 'h3', 'h4', 'blockquote', 'code', 'pre',
    'a', 'span', 'div'
  ]);
  out = out.replace(/<\/?([a-z0-9]+)\b([^>]*)>/gi, (_whole, tagName, rest) => {
    const tag = String(tagName || '').toLowerCase();
    const isClose = _whole.startsWith('</');

    // Dư phòng: nếu tới đây mà tag nằm trong block-strip list → bỏ.
    if (STRIP_BLOCK_TAGS.includes(tag)) return '';

    if (!ALLOWED_TAGS.has(tag)) {
      // Thẻ không whitelisted → xóa MỞ và ĐÓNG, giữ text bên trong (text node
      // đi qua mặc regex này vì chỉ khớp thẻ). Trả về '' để xóa thẻ.
      return '';
    }

    // Closing tag: trả về y nguyên — không cần attribute.
    if (isClose) return `</${tag}>`;

    // `<br>` không cần đóng; thẻ whitelisted khác giữ self-closing semantics OK.
    if (tag === 'br') return '<br>';

    if (tag === 'a') {
      // Trích href. Cho phép 1 dấu quote " hoặc ' hoặc bare value.
      const hrefMatch =
        rest.match(/\bhref\s*=\s*"([^"]*)"/i) ||
        rest.match(/\bhref\s*=\s*'([^']*)'/i) ||
        rest.match(/\bhref\s*=\s*([^\s>]+)/i);
      let href = hrefMatch ? hrefMatch[1] : '';
      // Validate scheme: chỉ http(s)/mailto/tel. Mọi scheme khác (javascript:, data:)
      // → drop.
      let safeHref = '';
      try {
        const trimmed = String(href || '').trim();
        if (trimmed && /^(?:https?:|mailto:|tel:)/i.test(trimmed)) {
          safeHref = trimmed.replace(/"/g, '&quot;');
        }
      } catch { /* noop */ }
      return safeHref
        ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`
        : '<a>';
    }

    // Thẻ whitelisted khác: drop toàn bộ attributes, giữ thẻ sạch.
    return `<${tag}>`;
  });

  // 5. Strip HTML comments.
  out = out.replace(/<!--[\s\S]*?-->/g, '');

  return out.trim();
}

export function renderNotificationEmailHtml({ notification, user = null, locale = 'vi', device = 'desktop' }) {
  const n = notification || {};
  const typeKey = n.type || 'announcement';
  const palette = BADGE_PALETTE[typeKey] || BADGE_PALETTE.announcement;
  const labels = locale === 'en' ? TYPE_LABELS_EN : TYPE_LABELS_VI;
  const typeLabel = labels[typeKey] || (locale === 'en' ? 'Notification' : 'Thông báo');

  const sampleUser = {
    full_name: 'Nguyễn Văn Test',
    username: 'testuser',
    email: 'test@example.com',
    plan: 'pro',
    ...user
  };

  // Dùng notification.title làm tiêu đề, message/html_content làm body.
  // - Nếu `html_content` có (Save As Template → admin soạn body riêng): dùng nó
  //   làm BODY (replace {{...}}, KHÔNG escape thẻ - admin tự chịu trách nhiệm).
  //   Title vẫn lấy từ `title` để hiển thị badge.
  // - Nếu không có html_content: dùng `message` (plain text) làm body, escape.
  const rawTitle = replaceVariablesForUser(n.title || '', sampleUser) || (locale === 'vi' ? 'Tiêu đề thông báo' : 'Notification Title');

  let safeMessage;
  if (n.html_content && typeof n.html_content === 'string' && n.html_content.trim() !== '') {
    // Đường Save As Template: body là HTML do admin soạn.
    // Pipeline: (1) replace {{...}} bằng giá trị user; (2) SANITIZE để bỏ thẻ
    // nguy hiểm (`<style>`, `<script>`, event handler, `style=`, `on*=`).
    // Lý do sanitize:
    //   - Trước đây KHÔNG sanitize → admin soạn template có `<style>` thì email
    //     user nhận hiển thị raw CSS hoặc body vỡ (email client bỏ inline CSS
    //     ngoài thẻ `<style>`, layout nhảy loạn).
    //   - Email client Gmail/Outlook KHÔNG render CSS trong body `<style>` —
    //     phải inline từng element (parser tốn time, dễ crash) — đơn giản nhất
    //     là strip `<style>` và yêu cầu admin dùng thẻ có sẵn.
    // Sau sanitize admin vẫn dùng được `<p>/<strong>/<a href>` cơ bản nhưng
    // KHÔNG lộ class/CSS nguy hiểm về phía user.
    const rendered = replaceVariablesForUser(n.html_content, sampleUser);
    safeMessage = sanitizeEmailHtml(rendered);
  } else {
    const message = replaceVariablesForUser(n.message || '', sampleUser) || (locale === 'vi' ? 'Nội dung thông báo sẽ hiển thị ở đây...' : 'Notification content will appear here...');
    safeMessage = escapeHtml(message);
  }

  const safeTitle = escapeHtml(rawTitle);
  const safeTypeLabel = escapeHtml(typeLabel);
  const safeSampleName = escapeHtml(sampleUser.full_name || 'Người dùng');
  const safeSampleEmail = escapeHtml(sampleUser.email || '');
  const safeMailFrom = escapeHtml(MAIL_FROM_NAME);
  const planLabel = sampleUser.plan === 'pro' ? 'Pro' : escapeHtml(sampleUser.plan || 'Miễn phí');

  const isUrgent = n.priority === 'urgent';
  const isHigh = n.priority === 'high' && !isUrgent;
  const isPromotion = typeKey === 'promotion';

  const widthStyle = device === 'mobile' ? 'max-width: 375px;' : 'max-width: 680px;';
  const initial = (sampleUser.full_name || 'U').charAt(0).toUpperCase();

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeMailFrom} - ${safeTypeLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="padding:24px 12px;display:flex;justify-content:center;">
<div style="${widthStyle}margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">

  <!-- Header gradient -->
  <div style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:24px 40px;">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:12px;">
        ${SYSTEM_LOGO_URL
          ? `<div style="background:rgba(255,255,255,.2);padding:6px;border-radius:8px;">
               <img src="${SYSTEM_LOGO_URL}" alt="${safeMailFrom}" style="max-height:48px;max-width:160px;object-fit:contain;display:block;" />
             </div>`
          : `<div style="width:48px;height:48px;background:rgba(255,255,255,.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">📨</div>`
        }
        <div>
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${safeMailFrom}</h1>
          <p style="margin:2px 0 0;color:rgba(255,255,255,.85);font-size:13px;">${safeTypeLabel}</p>
        </div>
      </div>
      ${isUrgent
        ? `<span style="background:#dc2626;color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${locale === 'vi' ? 'Ưu tiên cao' : 'Urgent'}</span>`
        : isHigh
          ? `<span style="background:#f59e0b;color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${locale === 'vi' ? 'Ưu tiên' : 'High'}</span>`
          : ''
      }
    </div>
  </div>

  <!-- Body -->
  <div style="padding:40px;">
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6;">
      ${locale === 'vi' ? 'Xin chào' : 'Hello'}
      <strong style="color:#f97316;">${safeSampleName}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
      ${locale === 'vi' ? 'Bạn có một thông báo mới từ ' : 'You have a new notification from '}
      <strong>${safeMailFrom}</strong>:
    </p>

    <!-- Title Box -->
    <div style="background:${palette.bg};border:2px solid ${palette.border};border-radius:14px;padding:18px 22px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${palette.text};text-transform:uppercase;letter-spacing:1px;">
        ${safeTypeLabel}
      </p>
      <h2 style="margin:0;font-size:20px;font-weight:700;color:#1f2937;line-height:1.4;">
        ${safeTitle}
      </h2>
    </div>

    <!-- Message Box -->
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 22px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">
        📝 ${locale === 'vi' ? 'Nội dung' : 'Content'}
      </p>
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${safeMessage}</p>
    </div>

    ${isPromotion
      ? `<div style="text-align:center;margin-bottom:24px;">
           <a href="${FRONTEND_URL}" style="display:inline-block;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#fff;padding:13px 32px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35);">
             ${locale === 'vi' ? 'Khám phá ưu đãi →' : 'Explore now →'}
           </a>
         </div>`
      : ''
    }

    <p style="margin:0 0 18px;font-size:13px;color:#6b7280;line-height:1.6;">
      ${locale === 'vi' ? 'Nếu có thắc mắc, vui lòng liên hệ ' : 'If you have questions, please contact '}
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#f97316;text-decoration:none;font-weight:500;">${SUPPORT_EMAIL}</a>.
    </p>

    <!-- User Info Chip -->
    <div style="background:#fff7ed;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px;">
      <div style="width:36px;height:36px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px;flex-shrink:0;">
        ${escapeHtml(initial)}
      </div>
      <div style="min-width:0;flex:1;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;">${safeSampleName}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#b45309;">${safeSampleEmail}</p>
      </div>
      <span style="background:#f97316;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;flex-shrink:0;">
        ${escapeHtml(planLabel)}
      </span>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:24px 40px;text-align:center;font-size:11px;color:#6b7280;">
    <p style="margin:0 0 4px;font-weight:600;">${locale === 'vi' ? 'Đơn vị chủ quản: Công ty TNHH Giải pháp số Digiso' : 'Operated by Digiso Digital Solutions Co., Ltd'}</p>
    <p style="margin:0 0 4px;">${locale === 'vi' ? 'Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh' : 'I.101B Block A, Software Tech Park, Vietnam National University HCMC'}</p>
    <p style="margin:0;">${locale === 'vi' ? 'Điện thoại: (+84) 877 909 606 | Email: info@digiso.vn' : 'Phone: (+84) 877 909 606 | Email: info@digiso.vn'}</p>
  </div>

</div>
</body>
</html>`;
}

export default renderNotificationEmailHtml;
