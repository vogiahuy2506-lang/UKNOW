/**
 * 6 mẫu HTML email theo notification.type — viết sẵn nội dung đầy đủ
 * theo pattern của AdminWelcomeEmailPage (mỗi mẫu có layout/component khác nhau).
 *
 * Mỗi entry = { subject, bodyHtml, label }. Subject map xuống field `title` khi gửi.
 * bodyHtml là PHẦN CONTENT, KHÔNG bao gồm <html>/<head>/<body> bao ngoài — `renderFreeformPreview`
 * sẽ bọc header + body + footer thành trang HTML hoàn chỉnh (cùng pattern buildBaseTemplate
 * ở backend systemEmail.util.js).
 *
 * Biến dùng:
 *   {{user_name}} {{user_email}} {{user_plan}} {{product_name}}
 *   {{current_date}} {{dashboard_url}} {{support_email}}
 *
 * Tông màu:
 *   - Header & CTA: gradient cam (#f97316 → #ea580c)
 *   - Tiêu đề H1: cam đậm #c2410c (đậm vừa đủ, không bị chìm)
 *   - Body text: #1f2937 (đen nhạt) + label phụ #4b5563
 *   - Nhấn mạnh số liệu/giá: #ea580c cam chủ
 *   - Footer: #6b7280 xám nhạt (chỉ phần footer info công ty)
 */

const SENDER_NAME = 'Founder AI';
const SENDER_TAGLINE = 'Nền tảng Marketing & AI cho doanh nghiệp';

// ---------------------------------------------------------------------------
// Header + Footer — pattern giống buildBaseTemplate() của backend
// ---------------------------------------------------------------------------

function buildHeader(subtitle) {
  // Logo PNG từ https://founderai.biz/logo.png — tự cache theo URL. Khi muốn thay logo chỉ
  // cần đổi file trên server, không phải sửa template. height=48 vừa khít block 48px.
  const logoUrl = 'https://founderai.biz/logo.png';
  return `
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:28px 32px 22px;text-align:center">
      <img src="${logoUrl}" alt="${SENDER_NAME}" height="56" width="56"
           style="display:inline-block;margin:0 auto 10px;max-width:120px;height:56px;width:auto;object-fit:contain;background:#ffffff;border-radius:14px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,.18)" />
      <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.3px">${SENDER_NAME}</p>
      <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,.9);letter-spacing:1px;text-transform:uppercase;font-weight:600">${subtitle}</p>
    </td>
  </tr>
</table>
`.trim();
}

function buildFooter() {
  return `
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="padding:24px 16px 12px;text-align:center;border-top:1px solid #fed7aa">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1f2937">Công ty TNHH Giải pháp số Digiso</p>
      <p style="margin:0 0 4px;font-size:11px;color:#4b5563;line-height:1.5">
        Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm ĐHQG Tp.HCM, P. Linh Trung, TP. Thủ Đức
      </p>
      <p style="margin:0 0 4px;font-size:11px;color:#4b5563">
        Hotline: (+84) 877 909 606 · Email: <a href="mailto:info@digiso.vn" style="color:#ea580c;text-decoration:none;font-weight:600">info@digiso.vn</a>
      </p>
      <p style="margin:8px 0 0;font-size:10px;color:#9ca3af">
        Bạn nhận email này vì đang sử dụng dịch vụ của ${SENDER_NAME}.
      </p>
    </td>
  </tr>
</table>
`.trim();
}

// CTA button — cam gradient, nhãn đen nét đậm
function ctaButton(href, label, accent = 'orange') {
  const bg = accent === 'red'
    ? 'background:linear-gradient(135deg,#dc2626,#b91c1c);box-shadow:0 4px 12px rgba(220,38,38,.35)'
    : accent === 'amber'
      ? 'background:linear-gradient(135deg,#f59e0b,#d97706);box-shadow:0 4px 12px rgba(245,158,11,.35)'
      : accent === 'green'
        ? 'background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 4px 12px rgba(34,197,94,.35)'
        : 'background:linear-gradient(135deg,#f97316,#ea580c);box-shadow:0 4px 12px rgba(249,115,22,.35)';
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
  <tr>
    <td style="text-align:center;padding:8px 0">
      <a href="${href}"
         style="display:inline-block;${bg};color:#ffffff;font-size:15px;font-weight:700;
                padding:14px 36px;border-radius:10px;text-decoration:none">
        ${label}
      </a>
    </td>
  </tr>
</table>`.trim();
}

// Common text styles (giữ consistency)
const TXT_LEAD = 'margin:0 0 6px;font-size:16px;color:#1f2937;line-height:1.6'; // đen
const TXT_BODY = 'margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6'; // xám đậm hơn
const TXT_H1 = 'margin:0 0 6px;font-size:22px;font-weight:800;color:#c2410c;line-height:1.3'; // cam đậm
const TXT_LABEL = 'margin:0 0 12px;font-size:12px;font-weight:700;color:#1f2937;text-transform:uppercase;letter-spacing:1px';
const TXT_FOOTER_NOTE = 'margin:24px 0 0;font-size:12px;color:#6b7280;line-height:1.6;text-align:center';

// ---------------------------------------------------------------------------
// MAINTENANCE
// ---------------------------------------------------------------------------
const MAINTENANCE_TEMPLATE = {
  key: 'maintenance',
  label: 'Bảo trì',
  subject: '[Founder AI] Thông báo bảo trì hệ thống',
  headerSubtitle: 'Thông báo bảo trì',
  bodyHtml: `
<h1 style="${TXT_H1}">🔧 Lịch bảo trì hệ thống</h1>
<p style="${TXT_LEAD}">
  Xin chào <strong style="color:#ea580c">{{user_name}}</strong>,
</p>
<p style="${TXT_BODY}">
  Để nâng cấp chất lượng dịch vụ, chúng tôi sẽ tiến hành bảo trì hệ thống theo lịch trình dưới đây.
  Trong thời gian bảo trì, một số tính năng có thể tạm thời không khả dụng.
</p>

<!-- Bảng thời gian -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td width="50%" style="padding-right:8px;vertical-align:top">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Bắt đầu</p>
            <p style="margin:0;font-size:15px;font-weight:800;color:#9a3412">{{current_date}}</p>
          </td>
        </tr>
      </table>
    </td>
    <td width="50%" style="padding-left:8px;vertical-align:top">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Thời gian dự kiến</p>
            <p style="margin:0;font-size:15px;font-weight:800;color:#991b1b">~30 phút</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Cảnh báo -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;margin-bottom:24px">
  <tr>
    <td style="padding:14px 16px">
      <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;font-weight:500">
        ⚠️ <strong style="color:#7f1d1d">Tính năng bị ảnh hưởng:</strong> gửi email, gửi Zalo OA, dashboard báo cáo.
        Dữ liệu chiến dịch và danh sách khách hàng của bạn đều được bảo toàn.
      </p>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Việc cần làm</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">▸</span> Lưu lại các chiến dịch đang soạn trước thời điểm bảo trì.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">▸</span> Hoãn lên lịch gửi mới trong khoảng thời gian trên.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">▸</span> Sau khi bảo trì xong, hệ thống tự động gửi các chiến dịch đã hẹn giờ bị bỏ qua.
    </td>
  </tr>
</table>

${ctaButton('{{dashboard_url}}', 'Mở dashboard →')}

<p style="${TXT_FOOTER_NOTE}">
  Cần hỗ trợ khẩn cấp trong thời gian bảo trì, vui lòng liên hệ
  <a href="mailto:{{support_email}}" style="color:#ea580c;text-decoration:none;font-weight:600">{{support_email}}</a>.
</p>
`.trim(),
};

// ---------------------------------------------------------------------------
// ANNOUNCEMENT
// ---------------------------------------------------------------------------
const ANNOUNCEMENT_TEMPLATE = {
  key: 'announcement',
  label: 'Thông báo',
  subject: '[Founder AI] Thông báo quan trọng từ đội ngũ',
  headerSubtitle: 'Thông báo chính thức',
  bodyHtml: `
<h1 style="${TXT_H1}">📢 Cập nhật mới từ Founder AI</h1>
<p style="${TXT_LEAD}">
  Xin chào <strong style="color:#ea580c">{{user_name}}</strong>,
</p>
<p style="${TXT_BODY}">
  Chúng tôi có một số cập nhật mới muốn chia sẻ với bạn vào ngày <strong style="color:#1f2937">{{current_date}}</strong>.
</p>

<!-- Badge -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">
  <tr>
    <td>
      <span style="display:inline-block;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">
        📢 Thông báo chính thức
      </span>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Nội dung chính</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-left:4px solid #ea580c;border-radius:0 10px 10px 0;margin-bottom:24px">
  <tr>
    <td style="padding:18px 20px">
      <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap">{{message}}</p>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Điểm nổi bật</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="padding:8px 0;font-size:14px;color:#1f2937;line-height:1.6">
      <span style="color:#ea580c;font-weight:700">✓</span> Cập nhật áp dụng từ <strong style="color:#1f2937">{{current_date}}</strong>.
    </td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:14px;color:#1f2937;line-height:1.6">
      <span style="color:#ea580c;font-weight:700">✓</span> Không ảnh hưởng tới dữ liệu chiến dịch đang chạy.
    </td>
  </tr>
  <tr>
    <td style="padding:8px 0;font-size:14px;color:#1f2937;line-height:1.6">
      <span style="color:#ea580c;font-weight:700">✓</span> Tài khoản gói <strong style="color:#ea580c">{{user_plan}}</strong> được dùng đầy đủ tính năng mới.
    </td>
  </tr>
</table>

${ctaButton('{{dashboard_url}}', 'Xem chi tiết trên dashboard →')}

<p style="${TXT_FOOTER_NOTE}">
  Có thắc mắc? Liên hệ
  <a href="mailto:{{support_email}}" style="color:#ea580c;text-decoration:none;font-weight:600">{{support_email}}</a>.
</p>
`.trim(),
};

// ---------------------------------------------------------------------------
// PROMOTION
// ---------------------------------------------------------------------------
const PROMOTION_TEMPLATE = {
  key: 'promotion',
  label: 'Khuyến mãi',
  subject: '[Founder AI] 🎁 Ưu đãi đặc biệt dành riêng cho bạn',
  headerSubtitle: 'Ưu đãi độc quyền',
  bodyHtml: `
<h1 style="${TXT_H1}">🎁 Ưu đãi giới hạn tháng này</h1>
<p style="${TXT_LEAD}">
  Xin chào <strong style="color:#ea580c">{{user_name}}</strong>,
</p>
<p style="${TXT_BODY}">
  Cảm ơn bạn đã đồng hành cùng <strong style="color:#ea580c">{{product_name}}</strong>. Nhân dịp tháng tri ân khách hàng,
  chúng tôi dành tặng bạn một ưu đãi <strong style="color:#ea580c">đặc biệt</strong> chỉ trong thời gian ngắn.
</p>

<!-- Hero gradient cam -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%);border:1px solid #fed7aa;border-radius:14px;margin-bottom:24px">
  <tr>
    <td style="padding:32px 24px;text-align:center">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:2px">
        Ưu đãi giới hạn
      </p>
      <p style="margin:0;font-size:46px;font-weight:900;color:#ea580c;line-height:1;letter-spacing:-1px">GIẢM 30%</p>
      <p style="margin:10px 0 0;font-size:14px;color:#9a3412;font-weight:600">Áp dụng cho mọi gói dịch vụ</p>
    </td>
  </tr>
</table>

<!-- Mã giảm giá -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:2px dashed #f97316;border-radius:14px;margin-bottom:24px">
  <tr>
    <td style="padding:22px;text-align:center">
      <p style="margin:0 0 6px;font-size:11px;color:#4b5563;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Mã giảm giá của bạn</p>
      <p style="margin:0;font-size:32px;font-weight:900;color:#ea580c;letter-spacing:6px;font-family:monospace">FOUNDER30</p>
      <p style="margin:10px 0 0;font-size:12px;color:#6b7280">Sao chép mã và nhập tại trang thanh toán.</p>
    </td>
  </tr>
</table>

<!-- Thời hạn -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;margin-bottom:24px">
  <tr>
    <td style="padding:14px 16px">
      <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;font-weight:500">
        ⏰ <strong style="color:#7f1d1d">Thời hạn đến {{current_date}}.</strong>
        Sau thời hạn này, mã sẽ tự hết hiệu lực và không thể khôi phục.
      </p>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Bạn nhận được</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">✓</span> Giảm <strong style="color:#ea580c">30%</strong> khi nâng cấp gói Pro/Pro+ trong tháng này.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">✓</span> Tặng thêm <strong style="color:#ea580c">500 email</strong> cho tài khoản gói hiện tại của bạn.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">✓</span> Áp dụng cho cả tài khoản con (sub-user) trong cùng workspace.
    </td>
  </tr>
</table>

${ctaButton('{{dashboard_url}}', '🚀 Sử dụng ưu đãi ngay →')}

<p style="${TXT_FOOTER_NOTE}">
  Ưu đãi áp dụng cho gói hiện tại: <strong style="color:#ea580c">{{user_plan}}</strong>.
  Liên hệ <a href="mailto:{{support_email}}" style="color:#ea580c;text-decoration:none;font-weight:600">{{support_email}}</a> nếu cần hỗ trợ.
</p>
`.trim(),
};

// ---------------------------------------------------------------------------
// WARNING
// ---------------------------------------------------------------------------
const WARNING_TEMPLATE = {
  key: 'warning',
  label: 'Cảnh báo',
  subject: '[Founder AI] ⚠️ Cảnh báo: cần kiểm tra tài khoản của bạn',
  headerSubtitle: 'Cảnh báo cần xử lý',
  bodyHtml: `
<h1 style="${TXT_H1}">⚠️ Có vấn đề cần bạn xác nhận</h1>
<p style="${TXT_LEAD}">
  Xin chào <strong style="color:#ea580c">{{user_name}}</strong>,
</p>
<p style="${TXT_BODY}">
  Hệ thống ghi nhận một số hoạt động cần bạn xác nhận trong tài khoản. Vui lòng xem chi tiết và phản hồi trong vòng <strong style="color:#ea580c">24 giờ</strong>.
</p>

<!-- Badge -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">
  <tr>
    <td>
      <span style="display:inline-block;background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">
        ⚠️ Mức cảnh báo: Trung bình
      </span>
    </td>
  </tr>
</table>

<!-- Nội dung -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;margin-bottom:24px">
  <tr>
    <td style="padding:18px 20px">
      <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap">{{message}}</p>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Tác động dự kiến</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #fed7aa;border-radius:10px;margin-bottom:24px">
  <tr>
    <td style="padding:6px 16px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="border-bottom:1px solid #fed7aa">
          <td style="padding:10px 0;font-size:13px;color:#6b7280;width:45%">Mức độ</td>
          <td style="padding:10px 0;font-size:13px;font-weight:700;color:#92400e">Trung bình — tự xử lý được</td>
        </tr>
        <tr style="border-bottom:1px solid #fed7aa">
          <td style="padding:10px 0;font-size:13px;color:#6b7280">Ảnh hưởng</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#1f2937">Chiến dịch tạm dừng nếu không xử lý</td>
        </tr>
        <tr style="border-bottom:1px solid #fed7aa">
          <td style="padding:10px 0;font-size:13px;color:#6b7280">Phát hiện lúc</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#1f2937">{{current_date}}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#6b7280">Hạn xử lý</td>
          <td style="padding:10px 0;font-size:13px;font-weight:700;color:#dc2626">Trong vòng 24 giờ</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

${ctaButton('{{dashboard_url}}', 'Xem và xử lý ngay →', 'amber')}

<p style="${TXT_FOOTER_NOTE}">
  Cần hỗ trợ? Liên hệ
  <a href="mailto:{{support_email}}" style="color:#d97706;text-decoration:none;font-weight:700">{{support_email}}</a>.
</p>
`.trim(),
};

// ---------------------------------------------------------------------------
// REMINDER
// ---------------------------------------------------------------------------
const REMINDER_TEMPLATE = {
  key: 'reminder',
  label: 'Nhắc nhở',
  subject: '[Founder AI] 🔔 Nhắc nhở: công việc cần hoàn thành',
  headerSubtitle: 'Nhắc nhở công việc',
  bodyHtml: `
<h1 style="${TXT_H1}">🔔 Nhắc nhở thân thiện</h1>
<p style="${TXT_LEAD}">
  Xin chào <strong style="color:#ea580c">{{user_name}}</strong>,
</p>
<p style="${TXT_BODY}">
  Đây là lời nhắc nhở về công việc bạn đã đặt lịch. Vui lòng hoàn thành trước thời hạn.
</p>

<!-- Badge -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">
  <tr>
    <td>
      <span style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px">
        🔔 Nhắc nhở thân thiện
      </span>
    </td>
  </tr>
</table>

<!-- Nội dung -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:0 10px 10px 0;margin-bottom:24px">
  <tr>
    <td style="padding:18px 20px">
      <p style="margin:0;font-size:15px;color:#1f2937;line-height:1.7;white-space:pre-wrap">{{message}}</p>
    </td>
  </tr>
</table>

<!-- Hạn chót -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#fff7ed,#ffedd5);border:2px solid #fed7aa;border-radius:12px;margin-bottom:24px">
  <tr>
    <td style="padding:18px 20px;text-align:center">
      <p style="margin:0;font-size:11px;font-weight:800;color:#9a3412;text-transform:uppercase;letter-spacing:1.5px">
        ⏰ Hạn chót
      </p>
      <p style="margin:8px 0 0;font-size:24px;font-weight:900;color:#9a3412;line-height:1.3">{{current_date}}</p>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Gợi ý xử lý</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">▸</span> Mở dashboard và kiểm tra mục liên quan.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">▸</span> Đối chiếu dữ liệu thực tế với kế hoạch.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#ea580c;font-weight:700">▸</span> Đánh dấu hoàn thành khi đã xử lý xong.
    </td>
  </tr>
</table>

${ctaButton('{{dashboard_url}}', 'Mở dashboard →', 'green')}

<p style="${TXT_FOOTER_NOTE}">
  Đây là email tự động, vui lòng không reply trực tiếp. Cần hỗ trợ liên hệ
  <a href="mailto:{{support_email}}" style="color:#16a34a;text-decoration:none;font-weight:700">{{support_email}}</a>.
</p>
`.trim(),
};

// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------
const SECURITY_TEMPLATE = {
  key: 'security',
  label: 'Bảo mật',
  subject: '[Founder AI] 🛡️ Cảnh báo bảo mật tài khoản của bạn',
  headerSubtitle: 'Cảnh báo bảo mật',
  bodyHtml: `
<h1 style="${TXT_H1.replace('#c2410c', '#dc2626')}">🛡️ Hoạt động cần xác nhận</h1>
<p style="${TXT_LEAD}">
  Xin chào <strong style="color:#ea580c">{{user_name}}</strong>,
</p>
<p style="${TXT_BODY}">
  Hệ thống phát hiện một sự kiện bảo mật liên quan tới tài khoản của bạn. Vui lòng kiểm tra và xác nhận.
</p>

<!-- Badge -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">
  <tr>
    <td>
      <span style="display:inline-block;background:#fef2f2;border:1px solid #fecaca;color:#7f1d1d;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px">
        🛡️ Cảnh báo bảo mật
      </span>
    </td>
  </tr>
</table>

<!-- Nội dung -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 10px 10px 0;margin-bottom:24px">
  <tr>
    <td style="padding:18px 20px">
      <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.7;white-space:pre-wrap">{{message}}</p>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Chi tiết sự kiện</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #fed7aa;border-radius:10px;margin-bottom:24px">
  <tr>
    <td style="padding:6px 16px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr style="border-bottom:1px solid #fed7aa">
          <td style="padding:10px 0;font-size:13px;color:#6b7280;width:40%">Tài khoản</td>
          <td style="padding:10px 0;font-size:13px;font-weight:700;color:#1f2937">{{user_email}}</td>
        </tr>
        <tr style="border-bottom:1px solid #fed7aa">
          <td style="padding:10px 0;font-size:13px;color:#6b7280">Thời gian phát hiện</td>
          <td style="padding:10px 0;font-size:13px;font-weight:600;color:#1f2937">{{current_date}}</td>
        </tr>
        <tr style="border-bottom:1px solid #fed7aa">
          <td style="padding:10px 0;font-size:13px;color:#6b7280">Gói tài khoản</td>
          <td style="padding:10px 0;font-size:13px;font-weight:700;color:#1f2937">{{user_plan}}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;font-size:13px;color:#6b7280">Trạng thái</td>
          <td style="padding:10px 0;font-size:13px;font-weight:700;color:#dc2626">Cần xác nhận của bạn</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="${TXT_LABEL}">Khuyến nghị</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#dc2626;font-weight:700">▸</span> Đổi mật khẩu ngay nếu bạn không nhận ra hoạt động trên.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#dc2626;font-weight:700">▸</span> Bật xác thực 2 yếu tố (2FA) cho tài khoản.
    </td>
  </tr>
  <tr>
    <td style="padding:6px 0 6px 24px;font-size:14px;color:#1f2937;line-height:1.7">
      <span style="color:#dc2626;font-weight:700">▸</span> Kiểm tra email <strong style="color:#1f2937">{{user_email}}</strong> để chắc chắn đây là bạn.
    </td>
  </tr>
</table>

${ctaButton('{{dashboard_url}}', 'Xác nhận là tôi →', 'red')}

<p style="${TXT_FOOTER_NOTE}">
  Nếu không phải bạn, vui lòng liên hệ ngay
  <a href="mailto:{{support_email}}" style="color:#dc2626;text-decoration:none;font-weight:700">{{support_email}}</a>.
</p>

<p style="margin:12px 0 0;font-size:11px;color:#9ca3af;line-height:1.6;text-align:center">
  Vì lý do bảo mật, một số thông tin chi tiết (IP, thiết bị) đã được ẩn trong email này.
  Bạn có thể xem đầy đủ trong mục Lịch sử đăng nhập của dashboard.
</p>
`.trim(),
};

// ---------------------------------------------------------------------------
// Registry + helpers
// ---------------------------------------------------------------------------

export const TYPE_TEMPLATES = {
  maintenance: MAINTENANCE_TEMPLATE,
  announcement: ANNOUNCEMENT_TEMPLATE,
  promotion: PROMOTION_TEMPLATE,
  warning: WARNING_TEMPLATE,
  reminder: REMINDER_TEMPLATE,
  security: SECURITY_TEMPLATE,
};

export const TYPE_LABEL_BY_KEY = Object.fromEntries(
  Object.entries(TYPE_TEMPLATES).map(([key, tpl]) => [key, tpl.label]),
);

// ---------------------------------------------------------------------------
// Variable substitution + full-page wrapper
// ---------------------------------------------------------------------------

function replaceVariables(content) {
  if (!content) return '';
  return content
    .replace(/\{\{user_name\}\}/g, 'Nguyễn Văn Test')
    .replace(/\{\{user_email\}\}/g, 'test@example.com')
    .replace(/\{\{user_plan\}\}/g, 'Pro')
    .replace(/\{\{product_name\}\}/g, SENDER_NAME)
    .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('vi-VN'))
    .replace(/\{\{dashboard_url\}\}/g, 'https://founderai.vn')
    .replace(/\{\{support_email\}\}/g, 'info@digiso.vn');
}

/**
 * Render một mẫu thành trang HTML hoàn chỉnh để hiển thị preview iframe.
 * Pattern giống buildBaseTemplate() backend: <table> card trắng + header cam + body + footer info.
 *
 * @param {{ templateKey?: keyof TYPE_TEMPLATES, bodyHtml?: string, subject?: string }} input
 */
export function renderFreeformPreview({ templateKey, bodyHtml, subject }) {
  // Nếu có templateKey → dùng bodyHtml mặc định + subtitle từ template
  const tpl = templateKey ? TYPE_TEMPLATES[templateKey] : null;
  const filled = replaceVariables(
    String(bodyHtml ?? tpl?.bodyHtml ?? '').trim(),
  );
  const headerSubtitle = tpl?.headerSubtitle || 'Thông báo từ Founder AI';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject || tpl?.subject || 'Email preview'}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
              ${buildHeader(headerSubtitle)}
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px">
                    ${filled}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              ${buildFooter()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Tách subject (input riêng) và bodyHtml (textarea).
 * Hiện không cần derive từ <title> vì mình đã có subject riêng — hàm này
 * giữ để tương thích ngược với NotificationCenter nếu có fallback.
 */
export function deriveTitleAndBody(html) {
  if (!html) return { title: '', body: '' };
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const body = String(html).replace(/<title[^>]*>[\s\S]*?<\/title>/i, '');
  return { title, body };
}

export default TYPE_TEMPLATES;
