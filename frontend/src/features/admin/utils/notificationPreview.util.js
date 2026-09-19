/**
 * Helper render HTML email preview cho notification system.
 *
 * TÁCH RA TỪ EmailPreviewModal.jsx để:
 *  1. Tái sử dụng cho iframe preview trên Notification Center (layout 2 cột).
 *  2. Tách biệt logic render thuần (string HTML) khỏi React modal lifecycle.
 *  3. Đảm bảo preview client-side không phụ thuộc network (giống EmailPreviewModal cũ).
 *
 * Badge palette khớp với NOTIFICATION_TYPE_CONFIG ở backend
 * (notification.service.js). Backend là nguồn chuẩn khi gửi thật.
 */

const SAMPLE_USER = {
  full_name: 'Nguyễn Văn Test',
  username: 'testuser',
  email: 'test@example.com',
  plan: 'pro',
  status: 'active'
};

const MAIL_FROM_NAME = 'Founder AI Platform';
const SYSTEM_LOGO_URL = '/logo.png';
const SUPPORT_EMAIL = 'info@digiso.vn';
const DASHBOARD_URL = 'https://founderai.vn';

const BADGE_PALETTE = {
  maintenance: { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  announcement: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  promotion: { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  reminder: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  security: { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d' }
};

const TYPE_LABELS = {
  maintenance: 'Bảo trì',
  announcement: 'Thông báo',
  promotion: 'Khuyến mãi',
  warning: 'Cảnh báo',
  reminder: 'Nhắc nhở',
  security: 'Bảo mật'
};

/**
 * Thay thế các biến {{user_name}}, {{user_email}}, ... bằng giá trị mẫu.
 * @param {string} content
 * @returns {string}
 */
function replaceVariables(content) {
  if (!content) return '';
  return content
    .replace(/\{\{user_name\}\}/g, SAMPLE_USER.full_name)
    .replace(/\{\{user_email\}\}/g, SAMPLE_USER.email)
    .replace(/\{\{user_plan\}\}/g, 'Pro')
    .replace(/\{\{product_name\}\}/g, MAIL_FROM_NAME)
    .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('vi-VN'))
    .replace(/\{\{dashboard_url\}\}/g, DASHBOARD_URL)
    .replace(/\{\{support_email\}\}/g, SUPPORT_EMAIL);
}

/**
 * Tính toán các giá trị render dựa trên notification + locale.
 * @param {Object} input
 * @param {Object|null} input.notification
 * @param {'vi'|'en'} input.locale
 * @returns {{title: string, message: string, typeKey: string, typeLabel: string,
 *   palette: Object, isPromotion: boolean, isUrgent: boolean, isHigh: boolean,
 *   initial: string, sampleUser: Object}}
 */
export function buildPreviewContext({ notification, locale }) {
  const typeKey = notification?.type || 'announcement';
  const palette = BADGE_PALETTE[typeKey] || BADGE_PALETTE.announcement;
  const typeLabel = TYPE_LABELS[typeKey] || TYPE_LABELS.announcement;

  const title = replaceVariables(
    locale === 'vi'
      ? (notification?.title || notification?.title_en)
      : (notification?.title_en || notification?.title)
  );
  const message = replaceVariables(
    locale === 'vi'
      ? (notification?.message || notification?.message_en)
      : (notification?.message_en || notification?.message)
  );

  return {
    title: title || (locale === 'vi' ? 'Tiêu đề thông báo' : 'Notification Title'),
    message: message || (locale === 'vi' ? 'Nội dung thông báo sẽ hiển thị ở đây...' : 'Notification content will appear here...'),
    typeKey,
    typeLabel,
    palette,
    isPromotion: typeKey === 'promotion',
    isUrgent: notification?.priority === 'urgent',
    isHigh: notification?.priority === 'high' && notification?.priority !== 'urgent',
    initial: (SAMPLE_USER.full_name || 'U').charAt(0).toUpperCase(),
    sampleUser: SAMPLE_USER
  };
}

/**
 * Escape HTML để tránh XSS khi render nội dung user nhập vào iframe.
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
 * Trả về chuỗi HTML đầy đủ cho iframe preview.
 *
 * @param {Object} input
 * @param {Object|null} input.notification - { type, priority, title, title_en, message, message_en }
 * @param {'vi'|'en'} [input.locale='vi']
 * @param {'desktop'|'mobile'} [input.device='desktop']
 * @returns {string} HTML string (sẵn để gán vào iframe srcDoc)
 */
export function renderNotificationHtml({ notification, locale = 'vi', device = 'desktop' }) {
  const ctx = buildPreviewContext({ notification, locale });

  const widthClass = device === 'mobile' ? 'max-width: 375px;' : 'max-width: 680px;';
  const safeTitle = escapeHtml(ctx.title);
  const safeMessage = escapeHtml(ctx.message);
  const safeTypeLabel = escapeHtml(ctx.typeLabel);
  const safeSampleName = escapeHtml(ctx.sampleUser.full_name);
  const safeSampleEmail = escapeHtml(ctx.sampleUser.email);
  const safeMailFrom = escapeHtml(MAIL_FROM_NAME);

  // white-space: pre-wrap giữ các dòng trong message (multi-line).
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeMailFrom} - ${safeTypeLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="padding:24px 12px;display:flex;justify-content:center;">
<div style="${widthClass}margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);">

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
      ${ctx.isUrgent
        ? `<span style="background:#dc2626;color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">${locale === 'vi' ? 'Ưu tiên cao' : 'Urgent'}</span>`
        : ctx.isHigh
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
    <div style="background:${ctx.palette.bg};border:2px solid ${ctx.palette.border};border-radius:14px;padding:18px 22px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${ctx.palette.text};text-transform:uppercase;letter-spacing:1px;">
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

    ${ctx.isPromotion
      ? `<div style="text-align:center;margin-bottom:24px;">
           <a href="${DASHBOARD_URL}" style="display:inline-block;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#fff;padding:13px 32px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35);">
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
        ${ctx.initial}
      </div>
      <div style="min-width:0;flex:1;">
        <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;">${safeSampleName}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#b45309;">${safeSampleEmail}</p>
      </div>
      <span style="background:#f97316;color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;flex-shrink:0;">
        Pro
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

export default renderNotificationHtml;
