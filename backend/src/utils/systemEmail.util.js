import nodemailer from 'nodemailer';

const SENDER_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';
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

export async function sendSystemEmail({ to, subject, html }) {
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
      });
      console.log(`[SystemEmail] Sent to ${to} (attempt ${attempt}): ${info.messageId}`);
      return info;
    } catch (err) {
      lastError = err;
      const isRetryable = err.statusCode >= 500 || err.statusCode === 429;
      console.warn(`[SystemEmail] Attempt ${attempt}/${maxRetries} failed for ${to}: ${err.message}`);

      if (!isRetryable || attempt === maxRetries) {
        break;
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
    }
  }

  throw lastError;
}

// ─── Base Template ────────────────────────────────────────────────────────────

function buildBaseTemplate({ subtitle, content, footerNote }) {
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
              <p style="margin:0">Điện thoại: (+84) 879529079 (Hotline) | Email: info@digiso.vn</p>
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

export function buildRenewalReminderEmail({ fullName, planName, expiresAt, daysLeft, renewalUrl }) {
  const expiryStr = new Date(expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

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
      <a href="mailto:support@digiso.vn" style="color:#f97316;text-decoration:none">support@digiso.vn</a>.
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

// ─── Welcome Email ────────────────────────────────────────────────────────────

export function buildWelcomeEmail({ fullName, email, planName = null, loginUrl }) {
  const displayName = fullName || email.split('@')[0];
  const planSection = planName ? `
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

  const content = `
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
      Nếu cần hỗ trợ, liên hệ <a href="mailto:support@digiso.vn" style="color:#f97316;text-decoration:none">support@digiso.vn</a> hoặc
      xem <a href="${FRONTEND_URL}/docs" style="color:#f97316;text-decoration:none">tài liệu hướng dẫn</a>.
    </p>
  `;

  return {
    subject: `Chào mừng đến với ${SENDER_NAME}!`,
    html: buildBaseTemplate({
      subtitle: 'Chào mừng bạn!',
      content,
      footerNote: 'Email này được gửi tự động từ hệ thống.',
    }),
  };
}

// ─── Payment Success Email ────────────────────────────────────────────────────

export function buildPaymentSuccessEmail({ fullName, email, planName, amount, billingPeriod, orderCode, paymentMethod, expiresAt, invoiceUrl }) {
  const amountFormatted = new Intl.NumberFormat('vi-VN').format(amount);
  const periodLabel = billingPeriod === 'yearly' ? 'năm' : 'tháng';
  const expiresStr = new Date(expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const methodLabel = paymentMethod === 'payos' ? 'PayOS (QR Code)' : paymentMethod === 'voucher' ? 'Voucher' : 'Thủ công';

  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || email}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Cảm ơn bạn đã thanh toán! Chúng tôi đã nhận được thanh toán của bạn và gói <strong>${planName}</strong> đã được kích hoạt thành công.
    </p>

    <!-- Success Badge -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:2px solid #22c55e;border-radius:12px;margin-bottom:24px">
      <tr>
        <td style="padding:20px;text-align:center">
          <p style="margin:0 0 8px;font-size:32px">🎉</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:1px">
            Thanh toán thành công!
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
              <td style="padding:8px 0;font-size:13px;color:#6b7280">Ngày hết hạn</td>
              <td style="padding:8px 0;font-size:13px;font-weight:600;color:#374151;text-align:right">${expiresStr}</td>
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
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${invoiceUrl}"
             style="display:inline-block;background:#374151;color:#fff;font-size:14px;font-weight:600;
                    padding:12px 28px;border-radius:8px;text-decoration:none">
            📄 Tải hóa đơn
          </a>
        </td>
      </tr>
    </table>

    <!-- Help -->
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu có thắc mắc về thanh toán, liên hệ <a href="mailto:billing@digiso.vn" style="color:#f97316;text-decoration:none">billing@digiso.vn</a>.
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
      footerNote: 'Nếu có thắc mắc, vui lòng liên hệ support@digiso.vn.',
    }),
  };
}
