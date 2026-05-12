import nodemailer from 'nodemailer';

const SENDER_NAME = process.env.SYSTEM_EMAIL_NAME || 'Founder AI Platform';
const SENDER_ADDRESS = process.env.SYSTEM_EMAIL_FROM || 'noreply@founderai.biz';

/**
 * Nodemailer transporter dùng SendGrid SMTP cho email hệ thống (nhắc hạn, thông báo).
 * Khác với email chiến dịch — cái này dùng API key chung, không qua SMTP riêng của user.
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
      user: 'apikey',
      pass: process.env.SENDGRID_API_KEY,
    },
  });
}

/**
 * Gửi một email hệ thống.
 *
 * @param {{ to: string, subject: string, html: string }} options
 */
export async function sendSystemEmail({ to, subject, html }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[SystemEmail] SENDGRID_API_KEY chưa được cấu hình — bỏ qua gửi email.');
    return;
  }
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_ADDRESS}>`,
    to,
    subject,
    html,
  });
}

/**
 * Email nhắc gia hạn gói (7 ngày hoặc 3 ngày trước hết hạn).
 */
export function buildRenewalReminderEmail({ fullName, planName, expiresAt, daysLeft, renewalUrl }) {
  const expiryStr = new Date(expiresAt).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const urgencyColor = daysLeft <= 3 ? '#dc2626' : '#d97706';
  const urgencyText = daysLeft <= 3
    ? `⚠️ Chỉ còn <strong style="color:${urgencyColor}">${daysLeft} ngày</strong>`
    : `📅 Còn <strong style="color:${urgencyColor}">${daysLeft} ngày</strong>`;

  return {
    subject: `[Founder AI] Gói ${planName} của bạn sắp hết hạn (còn ${daysLeft} ngày)`,
    html: `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#f97316;padding:28px 32px">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:700">Founder AI</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Thông báo gia hạn gói dịch vụ</p>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151">
        Xin chào <strong>${fullName || 'bạn'}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Gói <strong>${planName}</strong> của bạn sẽ hết hạn vào ngày
        <strong>${expiryStr}</strong>. ${urgencyText} nữa.
      </p>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e">
          Sau khi hết hạn, tài khoản sẽ không còn quyền gửi email và Zalo theo gói hiện tại.
          Gia hạn ngay để không bị gián đoạn.
        </p>
      </div>

      <div style="text-align:center;margin-bottom:32px">
        <a href="${renewalUrl}"
           style="display:inline-block;background:#f97316;color:#fff;font-size:15px;font-weight:600;
                  padding:14px 32px;border-radius:8px;text-decoration:none">
          Gia hạn gói ngay →
        </a>
      </div>

      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
        Nếu bạn đã gia hạn hoặc không muốn nhận thông báo này, vui lòng liên hệ
        <a href="mailto:support@founderai.biz" style="color:#f97316">support@founderai.biz</a>.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
        © ${new Date().getFullYear()} Founder AI Platform · Email tự động, vui lòng không reply trực tiếp.
      </p>
    </div>
  </div>
</body>
</html>`,
  };
}
