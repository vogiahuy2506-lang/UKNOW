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
              <p style="margin:0">Điện thoại: (+84) 879529079 (Hotline) | Email: hotro.digibook@gmail.com</p>
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
      <a href="mailto:hotro.digibook@gmail.com" style="color:#f97316;text-decoration:none">hotro.digibook@gmail.com</a>.
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
export function buildCampaignPausedEmail({ fullName, campaignName, channelLabel, resetAt, topupUrl }) {
  const resetStr = formatResetAtVi(resetAt);
  const channel = channelLabel || 'gửi';
  const name = campaignName || 'Chiến dịch';

  const content = `
    <p style="margin:0 0 6px;font-size:16px;color:#374151;line-height:1.6">
      Xin chào <strong style="color:#f97316">${fullName || 'bạn'}</strong>,
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6">
      Chiến dịch <strong>«${name}»</strong> đang tạm dừng vì hết lượt <strong>${channel}</strong> của gói hiện tại.
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
            Muốn chạy tiếp ngay thay vì chờ reset hạn mức? Mua thêm lượt gửi để chiến dịch tiếp tục.
          </p>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px">
      <tr>
        <td style="text-align:center">
          <a href="${topupUrl}"
             style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#fff;font-size:15px;font-weight:600;
                    padding:14px 36px;border-radius:10px;text-decoration:none;box-shadow:0 4px 12px rgba(249,115,22,.35)">
            Mua thêm hạn mức →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;text-align:center">
      Nếu bạn đã mua thêm hoặc không muốn nhận thông báo này, vui lòng liên hệ
      <a href="mailto:hotro.digibook@gmail.com" style="color:#f97316;text-decoration:none">hotro.digibook@gmail.com</a>.
    </p>
  `;

  return {
    subject: `[${SENDER_NAME}] Chiến dịch «${name}» tạm dừng vì hết lượt ${channel}`,
    html: buildBaseTemplate({
      subtitle: 'Chiến dịch tạm dừng — hết hạn mức gửi',
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
      <a href="mailto:hotro.digibook@gmail.com" style="color:#f97316;text-decoration:none">hotro.digibook@gmail.com</a>.
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
      Nếu cần hỗ trợ, liên hệ <a href="mailto:hotro.digibook@gmail.com" style="color:#f97316;text-decoration:none">hotro.digibook@gmail.com</a> hoặc
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
      Nếu có thắc mắc về thanh toán, liên hệ <a href="mailto:hotro.digibook@gmail.com" style="color:#f97316;text-decoration:none">hotro.digibook@gmail.com</a>.
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
      footerNote: 'Nếu có thắc mắc, vui lòng liên hệ hotro.digibook@gmail.com.',
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
