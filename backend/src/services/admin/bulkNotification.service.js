import * as bulkNotificationRepo from '../../repositories/admin/bulkNotification.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';

const SENDER_NAME = 'FounderAI';

/**
 * Build HTML email cho thông báo bảo trì hệ thống.
 */
function buildMaintenanceEmail({ title, message, durationMinutes, startTime }) {
  const startStr = startTime
    ? new Date(startTime).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : new Date().toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

  const durationText = durationMinutes
    ? `Dự kiến kéo dài khoảng <strong>${durationMinutes} phút</strong>.`
    : '';

  return {
    subject: `[FounderAI] Thông báo bảo trì hệ thống: ${title}`,
    html: `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">

    <!-- Header -->
    <div style="background:#dc2626;padding:28px 32px">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:700">⚠️ ${SENDER_NAME}</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">Thông báo bảo trì hệ thống</p>
    </div>

    <!-- Body -->
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151">
        Xin chào <strong>Quý khách hàng</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Chúng tôi xin thông báo rằng hệ thống <strong>FounderAI</strong> sẽ được bảo trì vào lúc:
      </p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <p style="margin:0;font-size:14px;color:#991b1b;line-height:1.6">
          <strong>Thời gian bắt đầu:</strong> ${startStr}<br/>
          ${durationText ? `<strong>Thời gian dự kiến:</strong> ${durationText.replace(/<\/?strong>/g, '')}<br/>` : ''}
        </p>
      </div>

      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:20px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">
          Tiêu đề thông báo
        </p>
        <p style="margin:0;font-size:16px;font-weight:600;color:#111827">${title}</p>
      </div>

      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">
          Nội dung thông báo
        </p>
        <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap">${message}</p>
      </div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
          ⚠️ <strong>Ảnh hưởng có thể xảy ra:</strong><br/>
          Trong thời gian bảo trì, một số tính năng có thể bị gián đoạn tạm thời, bao gồm:
        </p>
        <ul style="margin:8px 0 0 20px;font-size:13px;color:#92400e;line-height:1.8">
          <li>Đăng nhập / đăng xuất tài khoản</li>
          <li>Gửi email qua hệ thống</li>
          <li>Gửi tin nhắn Zalo (Zalo cá nhân, Zalo nhóm, Kết bạn)</li>
          <li>Chatbot tự động trả lời</li>
          <li>Một số tính năng khác của nền tảng</li>
        </ul>
      </div>

      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">
        Chúng tôi sẽ cố gắng hoàn thành bảo trì trong thời gian sớm nhất để giảm thiểu sự bất tiện cho Quý khách.
      </p>

      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6">
        Nếu Quý khách có bất kỳ thắc mắc nào, vui lòng liên hệ:
        <a href="mailto:support@digiso.vn" style="color:#f97316">support@digiso.vn</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
        © ${new Date().getFullYear()} FounderAI · Email tự động, vui lòng không reply trực tiếp.
      </p>
    </div>
  </div>
</body>
</html>`,
  };
}

/**
 * Gửi thông báo bảo trì tới tất cả user có email hợp lệ.
 * Trả về { sent, failed, total, failedEmails }.
 *
 * Luôn gửi hết tất cả email, không throw khi có lỗi riêng lẻ.
 * Retry được xử lý bên trong sendSystemEmail.
 */
export async function sendMaintenanceNotification({ title, message, durationMinutes, startTime }) {
  const users = await bulkNotificationRepo.findAllActiveUserEmails();
  if (users.length === 0) {
    return { sent: 0, failed: 0, total: 0, failedEmails: [] };
  }

  const emailContent = buildMaintenanceEmail({ title, message, durationMinutes, startTime });

  let sent = 0;
  let failed = 0;
  const failedEmails = [];

  // Gửi tuần tự để tránh spam SendGrid
  for (const user of users) {
    try {
      await sendSystemEmail({
        to: user.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });
      sent++;
    } catch (err) {
      console.error(`[BulkNotification] ❌ Gửi thất bại tới ${user.email}:`, err.message);
      failed++;
      failedEmails.push(user.email);
    }
    // Delay nhẹ để tránh trigger rate-limit (100ms là đủ giữa các lần gọi)
    await new Promise((r) => setTimeout(r, 100));
  }

  return { sent, failed, total: users.length, failedEmails };
}

/**
 * Lấy số lượng recipient dự kiến.
 */
export async function getRecipientCount() {
  return bulkNotificationRepo.countActiveUserEmails();
}
