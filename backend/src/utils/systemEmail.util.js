import nodemailer from 'nodemailer';

const SENDER_NAME = process.env.SYSTEM_EMAIL_NAME || 'FounderAI';
const SENDER_ADDRESS = process.env.SYSTEM_EMAIL_FROM || 'noreply@digiso.vn';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';
const SYSTEM_LOGO_URL = process.env.SYSTEM_LOGO_URL || `${FRONTEND_URL}/logo.png`;

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
 * Gửi một email hệ thống với retry logic.
 *
 * @param {{ to: string, subject: string, html: string }} options
 */
export async function sendSystemEmail({ to, subject, html }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('[SystemEmail] SENDGRID_API_KEY chưa được cấu hình — bỏ qua gửi email.');
    return;
  }

  const transporter = createTransporter();
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const info = await transporter.sendMail({
        from: `"${SENDER_NAME}" <${SENDER_ADDRESS}>`,
        to,
        subject,
        html,
      });
      console.log(`[SystemEmail] ✅ Sent to ${to} (attempt ${attempt}): ${info.messageId}`);
      return info;
    } catch (err) {
      lastError = err;
      const isRetryable = err.statusCode >= 500 || err.statusCode === 429;
      console.warn(`[SystemEmail] ⚠️ Attempt ${attempt}/${maxRetries} failed for ${to}: ${err.message} (status: ${err.statusCode})`);

      if (!isRetryable || attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
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

  // Header with logo
  const headerContent = SYSTEM_LOGO_URL
    ? `<div style="text-align:center;padding:8px 0">
         <img src="${SYSTEM_LOGO_URL}" alt="${SENDER_NAME}" style="max-height:50px;max-width:200px;object-fit:contain;">
       </div>
       <div style="text-align:center;margin-top:8px">
         <p style="margin:0;color:rgba(255,255,255,.85);font-size:13px">Thong bao gia han goi dich vu</p>
       </div>`
    : `<p style="margin:0;color:#fff;font-size:20px;font-weight:700">${SENDER_NAME}</p>
       <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Thong bao gia han goi dich vu</p>`;

  return {
    subject: `[Founder AI] Goi ${planName} cua ban sap het han (con ${daysLeft} ngay)`,
    html: `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#f97316;padding:24px 32px">
      ${headerContent}
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151">
        Xin chao <strong>${fullName || 'ban'}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Goi <strong>${planName}</strong> cua ban se het han vao ngay
        <strong>${expiryStr}</strong>. ${urgencyText} nua.
      </p>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e">
          Sau khi het han, tai khoan se khong con quyen gui email va Zalo theo goi hien tai.
          Gia han ngay de khong bi gian doan.
        </p>
      </div>

      <div style="text-align:center;margin-bottom:32px">
        <a href="${renewalUrl}"
           style="display:inline-block;background:#f97316;color:#fff;font-size:15px;font-weight:600;
                  padding:14px 32px;border-radius:8px;text-decoration:none">
          Gia han goi ngay →
        </a>
      </div>

      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
        Neu ban da gia han hoac khong muon nhan thong bao nay, vui long lien he
        <a href="mailto:support@digiso.vn" style="color:#f97316">support@digiso.vn</a>.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
        © ${new Date().getFullYear()} ${SENDER_NAME} · Email tu dong, vui long khong reply truc tiep.
      </p>
    </div>
  </div>
</body>
</html>`,
  };
}
