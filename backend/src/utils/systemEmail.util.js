import nodemailer from 'nodemailer';

export const SENDER_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';
const SENDER_ADDRESS = process.env.MAIL_FROM || 'founderai.noreply@digiso.vn';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';
const LOGO_URL = 'https://founderai.biz/logo.png';
const DEFAULT_FROM_EMAIL = 'founderai.noreply@digiso.vn';

// ─── Transporter ─────────────────────────────────────────────────────────────

function createTransporter() {
  const isSSL = process.env.MAIL_SSL === 'true';
  return nodemailer.createTransport({
    host: process.env.MAIL_SERVER || 'mail.digiso.vn',
    port: parseInt(process.env.MAIL_PORT, 10) || 465,
    secure: isSSL,
    secureConnection: isSSL,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

// ─── Core Sender ─────────────────────────────────────────────────────────────

export async function sendSystemEmail({
  to,
  subject,
  html,
  attachments = [],
  messageId = undefined,
}) {
  // Test env: no-op để KHÔNG gọi SMTP thật. SMTP fail trong test rồi retry
  // (setTimeout backoff) sẽ log SAU khi test kết thúc → flaky
  // "Cannot log after tests are done". Test nào CẦN xác minh gửi mail thì mock
  // nodemailer + set TEST_SEND_EMAIL='1' (verification.test.js, email.test.js).
  // Guard CHỈ khi NODE_ENV==='test' → prod/dev luôn gửi SMTP bình thường.
  if (process.env.NODE_ENV === 'test' && process.env.TEST_SEND_EMAIL !== '1') {
    return { messageId: messageId || 'test-noop', accepted: [to], skipped: true };
  }

  if (!to) {
    throw new Error('sendSystemEmail: thiếu recipient `to`');
  }

  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const maxAttachBytes = Number(process.env.SYSTEM_EMAIL_MAX_ATTACHMENT_BYTES) || 12 * 1024 * 1024;
  let totalBytes = 0;
  for (const a of safeAttachments) {
    if (!a || typeof a !== 'object') {
      throw new Error('sendSystemEmail: attachment không hợp lệ');
    }
    if (a.path || a.href || a.url) {
      throw new Error('sendSystemEmail: không chấp nhận path/URL attachment');
    }
    const size = Buffer.isBuffer(a.content) ? a.content.length : Buffer.byteLength(String(a.content || ''));
    totalBytes += size;
  }
  if (totalBytes > maxAttachBytes) {
    throw new Error('sendSystemEmail: tổng kích thước attachment vượt giới hạn');
  }

  const transporter = createTransporter();
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mailFrom = process.env.MAIL_FROM || DEFAULT_FROM_EMAIL;
      const mailFromName = process.env.MAIL_FROM_NAME || SENDER_NAME;
      const info = await transporter.sendMail({
        from: `"${mailFromName}" <${mailFrom}>`,
        to,
        subject,
        html,
        attachments: safeAttachments.map((a) => ({
          filename: a.filename || 'attachment',
          content: a.content,
          contentType: a.contentType || 'application/octet-stream',
        })),
        ...(messageId ? { messageId, headers: { 'Message-ID': messageId } } : {}),
      });
      console.log(`[SystemEmail] Sent (attempt ${attempt}): ${info.messageId}`);
      return info;
    } catch (err) {
      lastError = err;
      const isRetryable = err.statusCode >= 500 || err.statusCode === 429;
      console.warn(`[SystemEmail] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);

      if (!isRetryable || attempt === maxRetries) {
        break;
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    }
  }

  throw lastError;
}

// ─── Base Template (export để các service khác dùng chung) ────────────────────

export function buildBaseTemplate({ subtitle, content, footerNote }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:28px 32px 22px;text-align:center">
                    <img src="${LOGO_URL}" alt="${SENDER_NAME}" height="36" style="display:block;margin:0 auto 10px;max-width:150px;object-fit:contain">
                    <p style="margin:0;font-size:17px;font-weight:700;color:#ffffff">${SENDER_NAME}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.8);letter-spacing:.5px;text-transform:uppercase">${subtitle}</p>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px">
                <tr>
                  <td>
                    ${content}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px;text-align:center;font-size:11px;color:#6b7280">
              <p style="margin:0 0 4px;font-weight:600">Đơn vị chủ quản: Công ty TNHH Giải pháp số Digiso</p>
              <p style="margin:0 0 4px">Địa chỉ: Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh, Đ. Võ Trường Toản, KP. 6, Phường Linh Trung, Thành phố Thủ Đức.</p>
              <p style="margin:0">Điện thoại: (+84) 877 909 606 (Hotline) | Email: info@digiso.vn</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Renewal Reminder ─────────────────────────────────────────────────────────

/**
 * Đích của nút "Gia hạn / Nâng cấp" trong CẢ BA thư hạn gói: nhắc 7 ngày, nhắc 3 ngày, và T-0.
 *
 * Tách ra thành hàm riêng vì trước 13/09/2026 chỗ dựng URL này (scheduler.js) trỏ `/renewal` —
 * một đường dẫn **không có route**. `frontend/src/App.jsx:505` bắt mọi đường lạ bằng
 * `<Route path="*" element={<Navigate to="/" replace />} />`, nên khách bấm nút trong thư bị ném
 * về trang bán hàng công khai chứ không tới trang thanh toán. `RenewalScreen.jsx` có tồn tại
 * nhưng không ai import — code chết.
 *
 * Cạm bẫy khi kiểm: `curl https://founderai.biz/renewal` trả **200** và trông như đường dẫn sống.
 * Đây là SPA, server trả `index.html` cho mọi path; thứ quyết định là router phía client.
 *
 * `/app/billing` là route thật (`App.jsx:433` — `BillingHubPage`, bọc `OwnerRoute`). Ba thư này
 * chỉ gửi cho chủ tài khoản (`findExpiredUsers` / `findExpiringUsers` đều lọc `u.role = 'user'`)
 * nên `OwnerRoute` không cản.
 *
 * @returns {string}
 */
export function buildRenewalUrl() {
  return `${process.env.FRONTEND_URL || 'http://localhost:5174'}/app/billing`;
}

/**
 * PR-2b (13/09/2026) — `template` là bản super admin đã sửa (đọc qua
 * loadCustomSystemEmailTemplate('plan_expiring'), xem welcomeEmailTemplate.service.js), rỗng thì
 * dùng đúng nội dung cứng như hôm nay (không đổi hành vi khi chưa ai sửa).
 *
 * `graceDays` mặc định 0 vì CHƯA có caller nào truyền số ân hạn thật (cả 9 gói production hôm
 * nay đều grace_period_days=0 — xem Bẫy 1 của plan). Để sẵn tham số cho lúc có gói ân hạn > 0,
 * không tự đi lấy dữ liệu plans ở đây — ngoài phạm vi PR này.
 */
export function buildRenewalReminderEmail({ fullName, planName, expiresAt, daysLeft, renewalUrl, template = null, graceDays = 0 }) {
  const expiryStr = new Date(expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  if (template) {
    const values = {
      user_name: fullName || 'bạn',
      plan_name: planName || '',
      expires_at: expiryStr,
      days_left: String(daysLeft),
      grace_days: String(graceDays),
      upgrade_url: renewalUrl,
      sender_name: SENDER_NAME,
      support_email: 'info@digiso.vn',
    };
    return {
      subject: replaceSystemEmailVariables(template.subject, values).trim(),
      html: buildBaseTemplate({
        subtitle: 'Thông báo gia hạn dịch vụ',
        content: replaceSystemEmailVariables(template.bodyHtml, values, { html: true }),
        footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
      }),
    };
  }

  const isUrgent = daysLeft <= 3;
  const accentColor = isUrgent ? '#dc2626' : '#d97706';
  const badgeBg = isUrgent ? '#fef2f2' : '#fff7ed';
  const badgeBorder = isUrgent ? '#fecaca' : '#fed7aa';
  const badgeText = isUrgent ? '#991b1b' : '#92400e';
  const badgeEmoji = isUrgent ? '🚨' : '📅';

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || 'bạn'}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Gói <strong>${planName}</strong> của bạn sẽ hết hạn vào ngày <strong>${expiryStr}</strong>.
    </p>

    <!-- Countdown Badge -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${badgeBg};border:2px solid ${badgeBorder};border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;text-align:center">
          <p style="margin:0;font-size:13px;font-weight:600;color:${badgeText};text-transform:uppercase;letter-spacing:.5px">
            ${badgeEmoji} Còn lại
          </p>
          <p style="margin:4px 0 0;font-size:36px;font-weight:800;color:${accentColor};line-height:1">
            ${daysLeft} ngày
          </p>
        </td>
      </tr>
    </table>

    <!-- Warning Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;margin-bottom:28px">
      <tr>
        <td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6">
            ⚠️ <strong>Sau khi hết hạn:</strong> Tài khoản sẽ không còn quyền gửi email và Zalo theo gói hiện tại.
            Các chiến dịch đang chạy sẽ bị tạm dừng. Hãy gia hạn ngay để tránh gián đoạn.
          </p>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${renewalUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Gia hạn ngay →
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn đã gia hạn hoặc không muốn nhận thông báo này, vui lòng liên hệ
      <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none">info@digiso.vn</a>.
    </p>
  `;

  return {
    subject: `[${SENDER_NAME}] Gói ${planName} của bạn sắp hết hạn (còn ${daysLeft} ngày)`,
    html: buildBaseTemplate({
      subtitle: 'Thông báo gia hạn dịch vụ',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

/**
 * Mẫu mặc định (có {{...}}) cho super admin sửa qua trang admin — PR-2b, cùng khuôn
 * getDefaultWelcomeEmailTemplate(). Bỏ badge đếm-ngược-màu-động (isUrgent) của bản cứng: mẫu
 * lưu DB là tĩnh, admin có thể tự thêm màu khác nếu muốn khi sửa HTML.
 *
 * @returns {{ subject: string, bodyHtml: string }}
 */
export function getDefaultPlanExpiringEmailTemplate() {
  return {
    subject: `[${SENDER_NAME}] Gói {{plan_name}} của bạn sắp hết hạn (còn {{days_left}} ngày)`,
    bodyHtml: `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">{{user_name}}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Gói <strong>{{plan_name}}</strong> của bạn sẽ hết hạn vào ngày <strong>{{expires_at}}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:2px solid #fed7aa;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;text-align:center">
          <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.5px">
            📅 Còn lại
          </p>
          <p style="margin:4px 0 0;font-size:36px;font-weight:800;color:#d97706;line-height:1">
            {{days_left}} ngày
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #d97706;border-radius:0 8px 8px 0;margin-bottom:28px">
      <tr>
        <td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6">
            ⚠️ <strong>Sau khi hết hạn:</strong> Tài khoản sẽ không còn quyền gửi email và Zalo theo gói hiện tại.
            Các chiến dịch đang chạy sẽ dừng. Hãy gia hạn ngay để tránh gián đoạn.
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="{{upgrade_url}}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Gia hạn ngay →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn đã gia hạn hoặc không muốn nhận thông báo này, vui lòng liên hệ
      <a href="mailto:{{support_email}}" style="color:#f97316;text-decoration:none">{{support_email}}</a>.
    </p>
    `,
  };
}

// ─── Plan Expired (T-0) ───────────────────────────────────────────────────────

/**
 * Tạo email thông báo gói dịch vụ đã hết hạn (T-0).
 * Cùng khuôn HTML với buildRenewalReminderEmail, đổi sang thì quá khứ và bỏ huy hiệu đếm ngược.
 *
 * PR-2b (13/09/2026) — `template` là bản super admin đã sửa (đọc qua
 * loadCustomSystemEmailTemplate('plan_expired')), rỗng thì dùng đúng nội dung cứng như hôm nay.
 * `graceDays` mặc định 0, cùng lý do như buildRenewalReminderEmail — xem đó.
 *
 * @param {{ fullName?: string|null, planName: string, expiresAt?: string|Date, renewalUrl?: string, template?: {subject: string, bodyHtml: string}|null, graceDays?: number }} input
 * @returns {{ subject: string, html: string }}
 */
export function buildPlanExpiredEmail({ fullName, planName, expiresAt, renewalUrl, template = null, graceDays = 0 }) {
  const expiryStr = expiresAt ? new Date(expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) : 'gần đây';

  const accentColor = '#dc2626';
  const targetUrl = renewalUrl || `${process.env.FRONTEND_URL || 'http://localhost:5174'}/app/billing`;

  if (template) {
    const values = {
      user_name: fullName || 'bạn',
      plan_name: planName || '',
      expires_at: expiryStr,
      days_left: '0',
      grace_days: String(graceDays),
      upgrade_url: targetUrl,
      sender_name: SENDER_NAME,
      support_email: 'info@digiso.vn',
    };
    return {
      subject: replaceSystemEmailVariables(template.subject, values).trim(),
      html: buildBaseTemplate({
        subtitle: 'Thông báo hết hạn dịch vụ',
        content: replaceSystemEmailVariables(template.bodyHtml, values, { html: true }),
        footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
      }),
    };
  }

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || 'bạn'}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Gói <strong>${planName}</strong> của bạn đã hết hạn vào ngày <strong>${expiryStr}</strong>.
    </p>

    <!-- Expired Warning Box (bỏ huy hiệu đếm ngược, thay bằng cảnh báo trạng thái) -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;text-align:center">
          <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.5px">
            ⚠️ Gói dịch vụ đã hết hạn
          </p>
          <p style="margin:6px 0 0;font-size:14px;color:#7f1d1d;line-height:1.6">
            Quyền lợi gửi tin và tài nguyên theo gói đã tạm dừng. <strong>Các chiến dịch marketing đang chạy đã dừng.</strong>
          </p>
        </td>
      </tr>
    </table>

    <!-- Guidance Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;margin-bottom:28px">
      <tr>
        <td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">
            Để tiếp tục sử dụng dịch vụ và khởi động lại các chiến dịch, vui lòng gia hạn hoặc nâng cấp gói dịch vụ của bạn.
          </p>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${targetUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Gia hạn / Nâng gói ngay →
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn đã gia hạn hoặc cần hỗ trợ thêm, vui lòng liên hệ
      <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none">info@digiso.vn</a>.
    </p>
  `;

  return {
    subject: `[${SENDER_NAME}] Gói ${planName} của bạn đã hết hạn`,
    html: buildBaseTemplate({
      subtitle: 'Thông báo hết hạn dịch vụ',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

/**
 * Mẫu mặc định (có {{...}}) cho super admin sửa — cùng khuôn getDefaultPlanExpiringEmailTemplate().
 *
 * @returns {{ subject: string, bodyHtml: string }}
 */
export function getDefaultPlanExpiredEmailTemplate() {
  return {
    subject: `[${SENDER_NAME}] Gói {{plan_name}} của bạn đã hết hạn`,
    bodyHtml: `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">{{user_name}}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Gói <strong>{{plan_name}}</strong> của bạn đã hết hạn vào ngày <strong>{{expires_at}}</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;text-align:center">
          <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.5px">
            ⚠️ Gói dịch vụ đã hết hạn
          </p>
          <p style="margin:6px 0 0;font-size:14px;color:#7f1d1d;line-height:1.6">
            Quyền lợi gửi tin và tài nguyên theo gói đã tạm dừng. <strong>Các chiến dịch marketing đang chạy đã dừng.</strong>
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;margin-bottom:28px">
      <tr>
        <td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">
            Để tiếp tục sử dụng dịch vụ và khởi động lại các chiến dịch, vui lòng gia hạn hoặc nâng cấp gói dịch vụ của bạn.
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="{{upgrade_url}}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Gia hạn / Nâng gói ngay →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn đã gia hạn hoặc cần hỗ trợ thêm, vui lòng liên hệ
      <a href="mailto:{{support_email}}" style="color:#f97316;text-decoration:none">{{support_email}}</a>.
    </p>
    `,
  };
}

// ─── Campaign paused / stopped vì plan send-quota ─────────────────────────────

function formatResetAtVi(resetAt) {
  const d = resetAt instanceof Date ? resetAt : new Date(resetAt);
  if (!Number.isFinite(d.getTime())) return String(resetAt || '');
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Email khi campaign tạm hoãn vì hết lượt gửi gói (có mốc tự chạy lại).
 *
 * @param {{ fullName?: string|null, campaignName: string, channelLabel: string, resetAt: Date|string, topupUrl: string }} input
 * @returns {{ subject: string, html: string }}
 */
export function buildCampaignPausedEmail({
  fullName, campaignName, channelLabel, resetAt, topupUrl,
  isAccountLimit = false, settingsUrl = null,
}) {
  const resetStr = formatResetAtVi(resetAt);
  const channel = channelLabel || 'gửi';
  const name = campaignName || 'Chiến dịch';

  // Giới hạn tự đặt cho TÀI KHOẢN GỬI (PLAN_GIOI_HAN_GUI_THEO_NGAY_2026-09-22) khác hẳn hạn mức
  // GÓI: câu chữ và nút hành động phải đúng cái khách cần làm, nếu không họ đi mua thêm gói một
  // cách vô ích cho một giới hạn chính họ đã đặt.
  const introText = isAccountLimit
    ? `Chiến dịch <strong>«${name}»</strong> đang tạm dừng vì một tài khoản gửi dùng trong chiến dịch này đã đạt giới hạn <strong>${channel}/ngày mà bạn tự đặt</strong> — không phải hạn mức của gói.`
    : `Chiến dịch <strong>«${name}»</strong> đang tạm dừng vì hết lượt <strong>${channel}</strong> của gói hiện tại.`;
  const ctaBoxText = isAccountLimit
    ? 'Đây là giới hạn bạn tự đặt cho tài khoản gửi — mua thêm hạn mức gói sẽ KHÔNG giúp gửi tiếp ngay. Muốn gửi nhiều hơn, hãy vào Cài đặt kênh và nâng giới hạn/ngày cho tài khoản này.'
    : 'Muốn chạy tiếp ngay thay vì chờ reset hạn mức? Mua thêm lượt gửi để chiến dịch tiếp tục.';
  const ctaUrl = isAccountLimit && settingsUrl ? settingsUrl : topupUrl;
  const ctaLabel = isAccountLimit ? 'Mở Cài đặt kênh →' : 'Mua thêm hạn mức →';

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || 'bạn'}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      ${introText}
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:2px solid #fed7aa;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;text-align:center">
          <p style="margin:0;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.5px">
            Tự chạy lại lúc
          </p>
          <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#ea580c;line-height:1.3">
            ${resetStr}
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #ea580c;border-radius:0 8px 8px 0;margin-bottom:28px">
      <tr>
        <td style="padding:14px 16px">
          <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6">
            ${ctaBoxText}
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${ctaUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            ${ctaLabel}
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn đã mua thêm hoặc không muốn nhận thông báo này, vui lòng liên hệ
      <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none">info@digiso.vn</a>.
    </p>
  `;

  // Tiêu đề + phụ đề phải đi theo `isAccountLimit` như phần thân. Bản đầu của PR-2 chỉ sửa thân
  // thư, còn hai chỗ này vẫn cứng "hết lượt ... / hết hạn mức gửi" — mà tiêu đề mới là thứ khách
  // đọc TRƯỚC TIÊN trong hộp thư. Phát hiện 23/09 lúc dựng ảnh minh hoạ cho báo cáo: hai bản thư
  // render ra `subject` giống hệt nhau từng ký tự, đúng câu "tạm dừng vì hết lượt Zalo" mà cả PR
  // này sinh ra để thôi nói. Khách vẫn sẽ đi mua thêm gói một cách vô ích, chỉ khác là sau khi mở
  // thư ra mới biết.
  return {
    subject: isAccountLimit
      ? `[${SENDER_NAME}] Chiến dịch «${name}» tạm dừng vì chạm giới hạn ${channel}/ngày bạn tự đặt`
      : `[${SENDER_NAME}] Chiến dịch «${name}» tạm dừng vì hết lượt ${channel}`,
    html: buildBaseTemplate({
      subtitle: isAccountLimit
        ? 'Chiến dịch tạm dừng — chạm giới hạn bạn tự đặt'
        : 'Chiến dịch tạm dừng — hết hạn mức gửi',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

/**
 * Email khi campaign dừng hẳn vì gói hết hạn / không còn resetAt.
 *
 * @param {{ fullName?: string|null, campaignName: string, reason?: string, billingUrl: string }} input
 * @returns {{ subject: string, html: string }}
 */
export function buildCampaignStoppedQuotaEmail({ fullName, campaignName, reason, billingUrl }) {
  const name = campaignName || 'Chiến dịch';
  const detail = reason || 'Gói hết hạn hoặc hết hạn mức kỳ.';

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || 'bạn'}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Chiến dịch <strong>«${name}»</strong> đã dừng vì không còn hạn mức gửi hợp lệ.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:.5px">
            Lý do
          </p>
          <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;white-space:pre-wrap">${detail}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:14px;color:#6b7280;line-height:1.6">
      Gia hạn hoặc nâng gói để tiếp tục chạy chiến dịch.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${billingUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Gia hạn / nâng gói →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Cần hỗ trợ? Liên hệ
      <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none">info@digiso.vn</a>.
    </p>
  `;

  return {
    subject: `[${SENDER_NAME}] Chiến dịch «${name}» dừng vì hết hạn mức gói`,
    html: buildBaseTemplate({
      subtitle: 'Chiến dịch dừng — hết hạn mức gửi',
      content,
      footerNote: 'Đây là email tự động từ hệ thống. Vui lòng không reply.',
    }),
  };
}

// ─── Welcome Email ────────────────────────────────────────────────────────────

function buildWelcomePlanSection(planName) {
  return planName ? `
    <!-- Plan Info -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#166534;text-transform:uppercase;letter-spacing:.5px">Gói của bạn</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#15803d">${planName}</p>
        </td>
      </tr>
    </table>
  ` : '';
}

function buildDefaultWelcomeBodyHtml({ displayName, planSection, loginUrl }) {
  return `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${displayName}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Chào mừng bạn đến với <strong>${SENDER_NAME}</strong>! Tài khoản của bạn đã được tạo thành công.
    </p>

    ${planSection}

    <!-- Features Preview -->
    <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px">
      Bạn có thể làm gì với ${SENDER_NAME}?
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <td width="50%" style="padding-right:8px;vertical-align:top">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#f9fafb;border-radius:8px;padding:14px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151">📧 Gửi Email Marketing</p>
              <p style="margin:0;font-size:12px;color:#6b7280">Tạo và gửi chiến dịch email hàng loạt với template chuyên nghiệp</p>
            </td></tr>
          </table>
        </td>
        <td width="50%" style="padding-left:8px;vertical-align:top">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#f9fafb;border-radius:8px;padding:14px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151">💬 Zalo OA Marketing</p>
              <p style="margin:0;font-size:12px;color:#6b7280">Kết nối Zalo Official Account và gửi tin nhắn hàng loạt</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
      <tr>
        <td width="50%" style="padding-right:8px;vertical-align:top">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#f9fafb;border-radius:8px;padding:14px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151">🤖 AI Assistant</p>
              <p style="margin:0;font-size:12px;color:#6b7280">Sử dụng AI để tạo nội dung email, Zalo message tự động</p>
            </td></tr>
          </table>
        </td>
        <td width="50%" style="padding-left:8px;vertical-align:top">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="background:#f9fafb;border-radius:8px;padding:14px">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#374151">📊 Báo cáo chi tiết</p>
              <p style="margin:0;font-size:12px;color:#6b7280">Theo dõi tỷ lệ mở email, click, reply và hiệu suất chiến dịch</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${loginUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Bắt đầu ngay →
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu cần hỗ trợ, liên hệ <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none">info@digiso.vn</a> hoặc
      xem <a href="${FRONTEND_URL}/huong-dan" style="color:#f97316;text-decoration:none">tài liệu hướng dẫn</a>.
    </p>
  `;
}

export function getDefaultWelcomeEmailTemplate() {
  return {
    subject: `Chào mừng đến với ${SENDER_NAME}!`,
    bodyHtml: buildDefaultWelcomeBodyHtml({
      displayName: '{{user_name}}',
      planSection: '{{plan_section}}',
      loginUrl: '{{login_url}}',
    }),
  };
}

// Đổi tên 13/09/2026 (PR-2b việc 6) — hai hàm riêng của welcome, giờ dùng chung cho cả
// buildRenewalReminderEmail/buildPlanExpiredEmail (mẫu thư sắp/đã hết hạn, cũng do super admin
// sửa được từ nay). Không có consumer nào khác import hai hàm này (đều private, chỉ file này).
function escapeSystemEmailHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceSystemEmailVariables(template, values, { html = false } = {}) {
  return String(template || '').replace(/{{\s*([a-z_]+)\s*}}/gi, (_match, key) => {
    const value = values[key.toLowerCase()] ?? '';
    return html ? escapeSystemEmailHtml(value) : String(value).replace(/[\r\n]+/g, ' ');
  });
}

export function buildWelcomeEmail({ fullName, email, planName = null, loginUrl, template = null }) {
  const safeEmail = String(email || '');
  const displayName = fullName || safeEmail.split('@')[0] || 'bạn';
  const defaultTemplate = getDefaultWelcomeEmailTemplate();
  const selectedTemplate = {
    subject: template?.subject || defaultTemplate.subject,
    bodyHtml: template?.bodyHtml || defaultTemplate.bodyHtml,
  };
  const commonValues = {
    user_name: displayName,
    user_email: safeEmail,
    plan_name: planName || '',
    login_url: loginUrl || FRONTEND_URL,
    sender_name: SENDER_NAME,
    support_email: 'info@digiso.vn',
    docs_url: `${FRONTEND_URL}/huong-dan`,
  };
  const subject = replaceSystemEmailVariables(selectedTemplate.subject, {
    ...commonValues,
    plan_section: planName || '',
  }).trim();
  const bodyWithPlanSection = selectedTemplate.bodyHtml.replace(
    /{{\s*plan_section\s*}}/gi,
    buildWelcomePlanSection(escapeSystemEmailHtml(planName || ''))
  );
  const content = replaceSystemEmailVariables(bodyWithPlanSection, commonValues, { html: true });

  return {
    subject,
    html: buildBaseTemplate({
      subtitle: 'Chào mừng bạn!',
      content,
      footerNote: 'Email này được gửi tự động từ hệ thống.',
    }),
  };
}

export function getDefaultEmployeeInvitationTemplate() {
  return {
    subject: `[{{sender_name}}] Bạn được mời tham gia nhóm làm việc`,
    bodyHtml: `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào,
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6">
      <strong style="color:#f97316">{{owner_name}}</strong> đã mời bạn tham gia nhóm làm việc trên <strong>{{sender_name}}</strong>.
    </p>

    <!-- CTA Button -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="{{activation_url}}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Kích hoạt tài khoản →
          </a>
        </td>
      </tr>
    </table>

    <!-- Quick Guide Box -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px">
      <tr>
        <td style="padding:14px 16px;text-align:left">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1e293b">
            📌 Hướng dẫn tham gia:
          </p>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#475569;line-height:1.6">
            <li style="margin-bottom:4px">
              Bạn có thể <strong>tạo mật khẩu qua nút bấm trên</strong>, hoặc <strong>đăng nhập trực tiếp bằng Google</strong> (với email <strong>{{user_email}}</strong>) để vào làm việc ngay.
            </li>
            <li>
              Sau khi vào hệ thống, vui lòng <strong>đồng ý với các điều khoản</strong> và <strong>cập nhật đầy đủ thông tin</strong> tài khoản của bạn để hoàn tất hồ sơ.
            </li>
          </ul>
        </td>
      </tr>
    </table>

    <!-- Expiry -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:8px;margin-bottom:20px">
      <tr>
        <td style="padding:10px 16px;text-align:center">
          <p style="margin:0;font-size:12px;color:#92400e">
            ⏱️ Link kích hoạt có hiệu lực trong <strong>{{expiry_hours}} giờ</strong>.
          </p>
        </td>
      </tr>
    </table>

    <!-- Fallback link -->
    <p style="margin:0 0 6px;font-size:12px;color:#6b7280">
      Nếu nút trên không mở được, bạn có thể copy link này vào trình duyệt:
    </p>
    <p style="margin:0;font-size:11px;color:#9ca3af;word-break:break-all;background:#f9fafb;padding:8px 10px;border-radius:6px;border:1px solid #e5e7eb">
      {{activation_url}}
    </p>

    <!-- Security Note -->
    <p style="margin:20px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
      Nếu bạn không nhận ra yêu cầu này, vui lòng bỏ qua email.
    </p>
    `,
  };
}

export function buildEmployeeInvitationEmail({
  ownerName,
  email,
  activationUrl,
  expiryHours = 48,
  template = null,
}) {
  const defaultTemplate = getDefaultEmployeeInvitationTemplate();
  const selectedTemplate = {
    subject: template?.subject || defaultTemplate.subject,
    bodyHtml: template?.bodyHtml || defaultTemplate.bodyHtml,
  };
  const commonValues = {
    owner_name: ownerName || 'Admin',
    user_email: email || '',
    activation_url: activationUrl || FRONTEND_URL,
    expiry_hours: String(expiryHours || 48),
    sender_name: SENDER_NAME,
    support_email: 'info@digiso.vn',
  };
  const subject = replaceSystemEmailVariables(selectedTemplate.subject, commonValues).trim();
  const content = replaceSystemEmailVariables(selectedTemplate.bodyHtml, commonValues, { html: true });

  return {
    subject,
    html: buildBaseTemplate({
      subtitle: 'Team Invitation',
      content,
      footerNote: 'Email này được gửi tự động từ hệ thống.',
    }),
  };
}

// ─── Payment Success Email ────────────────────────────────────────────────────

export function buildPaymentSuccessEmail({
  fullName,
  email,
  planName,
  amount,
  billingPeriod,
  orderCode,
  paymentMethod,
  expiresAt,
  invoiceUrl,
  isScheduled = false,
  activateAfter = null,
  isEntitlementSuperseded = false,
  activePlanName = null,
}) {
  const amountFormatted = new Intl.NumberFormat('vi-VN').format(amount);
  const periodLabel = billingPeriod === 'yearly' ? 'năm' : 'tháng';
  const expiresStr = expiresAt ? new Date(expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) : '';
  const activateAfterStr = activateAfter ? new Date(activateAfter).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) : '';
  const methodLabel = paymentMethod === 'payos' ? 'PayOS (QR Code)' : paymentMethod === 'voucher' ? 'Voucher' : 'Thủ công';

  const titleText = isEntitlementSuperseded
    ? 'Thanh toán đã được ghi nhận!'
    : (isScheduled ? 'Đặt lịch hẹn đổi gói thành công!' : 'Thanh toán thành công!');
  const messageText = isEntitlementSuperseded
    ? `Chúng tôi đã nhận được thanh toán của bạn. Bạn đã có một đơn gói mới hơn được thanh toán trước đó, nên hệ thống giữ nguyên gói đang dùng${activePlanName ? ` là <strong>${activePlanName}</strong>` : ''} để tránh hạ gói ngoài ý muốn. Nếu cần hỗ trợ về đơn này, vui lòng liên hệ bộ phận thanh toán.`
    : (isScheduled
    ? `Cảm ơn bạn đã thanh toán! Đơn đặt lịch hẹn đổi sang gói <strong>${planName}</strong> đã được ghi nhận thành công. Gói sẽ tự động kích hoạt vào ngày <strong>${activateAfterStr}</strong> khi gói hiện tại của bạn hết hạn.`
    : `Cảm ơn bạn đã thanh toán! Chúng tôi đã nhận được thanh toán của bạn và gói <strong>${planName}</strong> đã được kích hoạt thành công.`);

  const dateRowLabel = isEntitlementSuperseded
    ? 'Trạng thái gói'
    : (isScheduled ? 'Ngày tự động kích hoạt' : 'Ngày hết hạn');
  const dateRowValue = isEntitlementSuperseded
    ? (activePlanName ? `Đang giữ gói ${activePlanName}` : 'Đang giữ theo đơn thanh toán mới hơn')
    : (isScheduled ? activateAfterStr : expiresStr);

  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || email}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      ${messageText}
    </p>

    <!-- Success Badge -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:20px;text-align:center">
          <p style="margin:0 0 8px;font-size:32px">🎉</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1px">
            ${titleText}
          </p>
        </td>
      </tr>
    </table>

    <!-- Order Details -->
    <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px">
      Chi tiết đơn hàng
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:20px">
      <tr>
        <td style="padding:16px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Mã đơn hàng</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">#${orderCode}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Gói dịch vụ</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">${planName}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Chu kỳ thanh toán</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">${periodLabel}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Phương thức</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">${methodLabel}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">${dateRowLabel}</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">${dateRowValue}</td>
            </tr>
            <tr>
              <td style="padding:12px 0 0;font-size:15px;font-weight:600;color:#374151">Tổng thanh toán</td>
              <td style="padding:12px 0 0;font-size:18px;font-weight:800;color:#f97316;text-align:right">${amountFormatted}đ</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Invoice CTA -->
    ${invoiceUrl ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5">
            Hóa đơn VAT đang được xử lý và sẽ được gửi tới email tài khoản của bạn.
          </p>
          <a href="${invoiceUrl}"
             style="display:inline-block;background:#374151;color:#fff;font-size:14px;font-weight:600;
                    padding:12px 28px;border-radius:8px;text-decoration:none">
            Xem trạng thái hóa đơn
          </a>
        </td>
      </tr>
    </table>` : ''}

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu có thắc mắc về thanh toán, liên hệ <a href="mailto:info@digiso.vn" style="color:#f97316;text-decoration:none">info@digiso.vn</a>.
    </p>
  `;

  return {
    subject: `[${SENDER_NAME}] Thanh toán thành công - Gói ${planName}`,
    html: buildBaseTemplate({
      subtitle: 'Xác nhận thanh toán',
      content,
      footerNote: 'Email này là chứng từ thanh toán. Vui lòng lưu giữ để đối soát.',
    }),
  };
}

// ─── Invoice PDF issued email ─────────────────────────────────────────────────

export function buildInvoiceIssuedEmail({
  orderCode,
  soHdon,
  khhdon,
  amount,
  invoiceUrl,
  cqtOk = false,
}) {
  const amountFormatted = new Intl.NumberFormat('vi-VN').format(Number(amount) || 0);
  const statusNote = cqtOk
    ? 'Hóa đơn đã được cơ quan thuế tiếp nhận.'
    : 'Hóa đơn điện tử đã được phát hành. File PDF đính kèm trong email này.';

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#6b7280;line-height:1.6">
      ${statusNote}
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:20px">
      <tr>
        <td style="padding:16px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Mã đơn hàng</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">#${orderCode}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Ký hiệu / số HĐ</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">${khhdon || '—'} ${soHdon || ''}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Tổng tiền</td>
              <td style="padding:8px 0;font-size:15px;font-weight:700;color:#f97316;text-align:right">${amountFormatted}đ</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${invoiceUrl ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px">
      <tr>
        <td style="text-align:center">
          <a href="${invoiceUrl}"
             style="display:inline-block;background:#374151;color:#fff;font-size:14px;font-weight:600;
                    padding:12px 28px;border-radius:8px;text-decoration:none">
            Mở trang hóa đơn
          </a>
        </td>
      </tr>
    </table>` : ''}
  `;

  return {
    subject: `[${SENDER_NAME}] Hóa đơn điện tử đơn #${orderCode}`,
    html: buildBaseTemplate({
      subtitle: 'Hóa đơn điện tử',
      content,
      footerNote: 'File PDF hóa đơn được đính kèm. Vui lòng lưu giữ để đối soát.',
    }),
  };
}

// ─── Contact Form Notification (to internal team) ────────────────────────────

export function buildContactNotificationEmail({ name, email, phone, company, message, ipAddress }) {
  const submittedAt = new Date().toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const safe = (v) => (v == null || v === '' ? '<em style="color:#9ca3af">—</em>' : String(v));

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Có một yêu cầu liên hệ mới từ website,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Vui lòng phản hồi khách hàng trong vòng <strong>24 giờ</strong>.
    </p>

    <!-- Customer info table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:20px">
      <tr>
        <td style="padding:16px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280;width:140px">Họ và tên</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">${safe(name)}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Email</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">
                <a href="mailto:${safe(email)}" style="color:#f97316;text-decoration:none">${safe(email)}</a>
              </td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Số điện thoại</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">
                ${phone ? `<a href="tel:${safe(phone)}" style="color:#f97316;text-decoration:none">${safe(phone)}</a>` : '<em style="color:#9ca3af">—</em>'}
              </td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Công ty</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151">${safe(company)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Thời gian</td>
              <td style="padding:8px 0;font-size:13px;color:#374151">${submittedAt}${ipAddress ? ` <span style="color:#9ca3af">(IP: ${ipAddress})</span>` : ''}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Message -->
    <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.5px">
      Nội dung liên hệ
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-left:4px solid #f97316;border-radius:0 8px 8px 0;margin-bottom:24px">
      <tr>
        <td style="padding:16px">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap">${safe(message)}</p>
        </td>
      </tr>
    </table>

    <!-- Reply CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:center">
          <a href="mailto:${safe(email)}?subject=Re: Yêu cầu liên hệ từ ${safe(name)}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:12px 32px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Phản hồi khách hàng →
          </a>
        </td>
      </tr>
    </table>
  `;

  return {
    subject: `[Contact] Khách mới: ${name} — ${email}`,
    html: buildBaseTemplate({
      subtitle: 'Yêu cầu liên hệ mới',
      content,
      footerNote: 'Email thông báo tự động từ form liên hệ website.',
    }),
  };
}

// ─── Maintenance Notice ───────────────────────────────────────────────────────

export function buildMaintenanceEmail({ title, message, durationMinutes, startTime }) {
  const startStr = new Date(startTime).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Chúng tôi sẽ thực hiện bảo trì hệ thống theo lịch trình. Vui lòng lưu ý các thông tin bên dưới:
    </p>

    <!-- Info Cards -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr>
        <!-- Start Time -->
        <td width="50%" style="padding-right:8px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px;text-align:center">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Bắt đầu</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#92400e">${startStr}</p>
              </td>
            </tr>
          </table>
        </td>
        <!-- Duration -->
        <td width="50%" style="padding-left:8px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center">
                <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px">Thời gian</p>
                <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b">~${durationMinutes} phút</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Message -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Chi tiết</p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${message}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
      Cảm ơn bạn đã kiên nhẫn. Chúng tôi sẽ cố gắng hoàn thành sớm nhất có thể.
    </p>
  `;

  return {
    subject: `[${SENDER_NAME}] ${title}`,
    html: buildBaseTemplate({
      subtitle: 'Thông báo bảo trì hệ thống',
      content,
      footerNote: 'Nếu có thắc mắc, vui lòng liên hệ info@digiso.vn.',
    }),
  };
}

// ─── Ops Alert (PLAN_DO_LUONG_KPI Phần A5) ────────────────────────────────────

export function buildAlertEmail({ ruleName, severity, message, measuredValue, alertsUrl }) {
  const isCritical = severity === 'critical';
  const accent = isCritical ? '#dc2626' : '#d97706';
  const badgeBg = isCritical ? '#fef2f2' : '#fff7ed';
  const badgeBorder = isCritical ? '#fecaca' : '#fed7aa';
  const badgeText = isCritical ? '#991b1b' : '#92400e';
  const measured = measuredValue == null ? '—' : String(measuredValue);

  const content = `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
      Quy tắc <strong style="color:${accent}">${ruleName || 'Cảnh báo'}</strong> vừa kích hoạt.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${badgeBg};border:2px solid ${badgeBorder};border-radius:12px;margin-bottom:20px">
      <tr>
        <td style="padding:14px 18px;text-align:center">
          <p style="margin:0;font-size:12px;font-weight:600;color:${badgeText};text-transform:uppercase;letter-spacing:.5px">
            ${isCritical ? 'Nghiêm trọng' : 'Cảnh báo'} · Giá trị đo
          </p>
          <p style="margin:6px 0 0;font-size:28px;font-weight:800;color:${accent};line-height:1">${measured}</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px">
          <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Chi tiết</p>
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${message || ''}</p>
        </td>
      </tr>
    </table>
    ${alertsUrl ? `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${alertsUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px">
            Mở trung tâm cảnh báo
          </a>
        </td>
      </tr>
    </table>` : ''}
  `;

  return buildBaseTemplate({
    subtitle: 'Cảnh báo vận hành',
    content,
    footerNote: 'Email này gửi tới siêu quản trị. Có thể tắt/chỉnh ngưỡng tại /admin/alerts.',
  });
}
