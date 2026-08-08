import dotenv from 'dotenv';
dotenv.config();

import { sendSystemEmail, buildRenewalReminderEmail, buildMaintenanceEmail, buildWelcomeEmail, buildPaymentSuccessEmail } from './src/utils/systemEmail.util.js';

const PRODUCT_NAME = process.env.MAIL_FROM_NAME || 'Founder AI';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://founderai.vn';
const LOGO_URL = 'https://founderai.biz/logo.png';
const TEST_EMAIL = 'phucnh622@uef.edu.vn';

// ─── Copied from verification.service.js ───────────────────────────────────

function buildBaseTemplate({ title, subtitle, content }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
          <tr>
            <td style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:32px 32px 24px;text-align:center">
                    <img src="${LOGO_URL}" alt="${PRODUCT_NAME}" height="40" style="display:block;margin:0 auto 12px;max-width:160px;object-fit:contain">
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff">${PRODUCT_NAME}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,.8)">${subtitle}</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px">
                <tr><td>${content}</td></tr>
              </table>
            </td>
          </tr>
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

function buildVerifyEmailHtml({ code, expiryMinutes = 10 }) {
  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">Xin chào,</p>
    <p style="margin:0 0 28px;font-size:15px;color:#6b7280;line-height:1.6">Cảm ơn bạn đã đăng ký. Vui lòng sử dụng mã bên dưới để xác minh email của bạn:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:2px dashed #fed7aa;border-radius:12px;margin-bottom:28px">
      <tr><td style="padding:28px;text-align:center">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Mã xác minh của bạn</p>
        <p style="margin:0;font-size:40px;font-weight:800;letter-spacing:10px;color:#f97316;font-family:'SF Mono',Monaco,monospace">${code}</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:12px 16px;text-align:center">
        <p style="margin:0;font-size:13px;color:#991b1b">⏱️ Mã này sẽ hết hạn sau <strong>${expiryMinutes} phút</strong>.</p>
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email. Tài khoản của bạn sẽ không bị thay đổi.</p>
  `;
  return buildBaseTemplate({ title: 'Xác minh email của bạn', subtitle: 'Verification Email', content });
}

function buildInvitationEmailHtml({ ownerName, activationUrl, expiryHours = 48 }) {
  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">Xin chào,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6"><strong style="color:#f97316">${ownerName}</strong> đã mời bạn tham gia team trên <strong>${PRODUCT_NAME}</strong>. Nhấn nút bên dưới để kích hoạt tài khoản và đặt mật khẩu của bạn.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="text-align:center">
        <a href="${activationUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">Kích hoạt tài khoản →</a>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:12px 16px;text-align:center">
        <p style="margin:0;font-size:13px;color:#92400e">⏱️ Link kích hoạt có hiệu lực trong <strong>${expiryHours} giờ</strong>.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Hoặc copy link bên dưới và dán vào trình duyệt:</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;word-break:break-all;background:#f9fafb;padding:10px 12px;border-radius:6px;border:1px solid #e5e7eb">${activationUrl}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6">Nếu bạn không nhận ra yêu cầu này, vui lòng bỏ qua email. Tài khoản của bạn sẽ không bị thay đổi.</p>
  `;
  return buildBaseTemplate({ title: 'Lời mời tham gia team', subtitle: 'Team Invitation', content });
}

function buildResetEmailHtml({ resetUrl, expiryMinutes = 60 }) {
  const content = `
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.6">Xin chào,</p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn trên <strong>${PRODUCT_NAME}</strong>. Nhấn nút bên dưới để tiếp tục đặt lại mật khẩu.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;margin-bottom:24px">
      <tr><td style="padding:12px 16px">
        <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.5">⚠️ <strong>Lưu ý bảo mật:</strong> Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng KHÔNG nhấn nút bên dưới và bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.</p>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="text-align:center">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">Đặt lại mật khẩu →</a>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border-radius:8px;margin-bottom:24px">
      <tr><td style="padding:12px 16px;text-align:center">
        <p style="margin:0;font-size:13px;color:#92400e">⏱️ Link đặt lại có hiệu lực trong <strong>${expiryMinutes} phút</strong>.</p>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Hoặc copy link bên dưới và dán vào trình duyệt:</p>
    <p style="margin:0;font-size:12px;color:#9ca3af;word-break:break-all;background:#f9fafb;padding:10px 12px;border-radius:6px;border:1px solid #e5e7eb">${resetUrl}</p>
  `;
  return buildBaseTemplate({ title: 'Đặt lại mật khẩu', subtitle: 'Password Reset', content });
}

// ─── Test Templates ─────────────────────────────────────────────────────────

const templates = [
  {
    name: '1. RenewalReminder',
    fn: () => buildRenewalReminderEmail({
      fullName: 'Hoang Phuc',
      planName: 'Pro Plan',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      daysLeft: 7,
      renewalUrl: `${FRONTEND_URL}/pricing`
    })
  },
  {
    name: '2. Maintenance',
    fn: () => buildMaintenanceEmail({
      title: 'Bảo trì hệ thống',
      message: 'Hệ thống sẽ được bảo trì vào lúc 2:00 AM đêm nay. Dự kiến hoàn thành trong 60 phút.',
      durationMinutes: 60,
      startTime: new Date()
    })
  },
  {
    name: '3. VerifyEmail',
    fn: () => ({
      subject: `[${PRODUCT_NAME}] Mã xác minh email của bạn`,
      html: buildVerifyEmailHtml({ code: '123456', expiryMinutes: 10 })
    })
  },
  {
    name: '4. Invitation',
    fn: () => ({
      subject: `[${PRODUCT_NAME}] Bạn được mời tham gia team`,
      html: buildInvitationEmailHtml({
        ownerName: 'Hoang Phuc',
        activationUrl: `${FRONTEND_URL}/activate?token=test-token-abc123`,
        expiryHours: 48
      })
    })
  },
  {
    name: '5. PasswordReset',
    fn: () => ({
      subject: `[${PRODUCT_NAME}] Đặt lại mật khẩu của bạn`,
      html: buildResetEmailHtml({
        resetUrl: `${FRONTEND_URL}/reset-password?token=test-token-xyz789`,
        expiryMinutes: 60
      })
    })
  },
  {
    name: '6. WelcomeEmail (NEW)',
    fn: () => buildWelcomeEmail({
      fullName: 'Hoang Phuc',
      email: 'test@example.com',
      planName: 'Pro Plan',
      loginUrl: `${FRONTEND_URL}/login`
    })
  },
  {
    name: '7. PaymentSuccess (NEW)',
    fn: () => buildPaymentSuccessEmail({
      fullName: 'Hoang Phuc',
      email: 'test@example.com',
      planName: 'Pro Plan',
      amount: 199000,
      billingPeriod: 'monthly',
      orderCode: '1234567890',
      paymentMethod: 'payos',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      invoiceUrl: `${FRONTEND_URL}/invoices/1234567890`
    })
  }
];

async function runTests() {
  console.log(`\n=== TEST ALL SYSTEM EMAILS ===`);
  console.log(`Sending to: ${TEST_EMAIL}\n`);

  for (const template of templates) {
    console.log(`Testing: ${template.name}...`);
    try {
      const { subject, html } = template.fn();
      await sendSystemEmail({
        to: TEST_EMAIL,
        subject: `[TEST] ${subject}`,
        html,
      });
      console.log(`  ✓ Sent successfully\n`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`);
    }
  }

  console.log('=== ALL TESTS COMPLETED ===\n');
}

runTests();
