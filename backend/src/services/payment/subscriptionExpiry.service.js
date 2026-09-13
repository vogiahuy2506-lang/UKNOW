import db from '../../config/database.js';
import {
  findExpiredUsers,
  expireUserPlan,
  incrementReminderCount,
} from '../../repositories/subscription/subscription.repository.js';
import {
  buildPlanExpiredEmail,
  sendSystemEmail,
} from '../../utils/systemEmail.util.js';

/**
 * Xử lý các gói thuê bao đã hết hạn:
 * 1. Quét danh sách user có gói hết hạn (sau cả thời gian ân hạn).
 * 2. Gửi email thông báo hết hạn T-0 (nếu reminder_count < 3 và có email) TRƯỚC KHI thu hồi gói.
 * 3. Tăng reminder_count sau khi gửi email thành công.
 * 4. Thu hồi gói (expireUserPlan).
 *
 * @param {{ renewalUrl?: string, queryable?: object }} [options]
 * @returns {Promise<{ expiredCount: number, emailsSent: number, totalFound: number }>}
 */
export async function processExpiredSubscriptions({ renewalUrl, queryable = db } = {}) {
  const expired = await findExpiredUsers(queryable);
  let expiredCount = 0;
  let emailsSent = 0;

  for (const user of expired) {
    // 1. Gửi thư T-0 TRƯỚC expireUserPlan (khi active_plan_id và plan_name vẫn còn)
    const reminderCount = Number(user.subscription_reminder_count || 0);
    if (reminderCount < 3) {
      if (user.email) {
        try {
          const { subject, html } = buildPlanExpiredEmail({
            fullName: user.full_name,
            planName: user.plan_name,
            expiresAt: user.subscription_expires_at,
            renewalUrl,
          });
          await sendSystemEmail({ to: user.email, subject, html });
          await incrementReminderCount(user.id, queryable);
          emailsSent++;
          console.log(`[Subscription] Đã gửi thư hết hạn T-0 → ${user.email} (${user.plan_name})`);
        } catch (emailErr) {
          // Lỗi gửi thư cho 1 người không được làm hỏng cả lượt cron.
          //
          // Không gọi incrementReminderCount ở đây, nhưng ĐỪNG đọc đó là "để gửi lại sau":
          // ngay dưới đây gói vẫn bị thu hồi, mà findExpiredUsers JOIN plans ON
          // u.active_plan_id = p.id (subscription.repository.js:37) nên người này KHÔNG BAO GIỜ
          // quay lại danh sách. Thư mất thật. Ghim ở
          // tests/integration/subscriptionExpiryCron.test.js — "Thư T-0 hỏng".
          //
          // Vẫn thu hồi vô điều kiện vì đó là lựa chọn an toàn về tiền: bỏ qua thu hồi khi thư
          // hỏng thì một địa chỉ email hỏng vĩnh viễn = dùng dịch vụ miễn phí vĩnh viễn.
          // Muốn không mất thư thì phải có hàng đợi gửi lại — việc khác, không phải PR này.
          console.error(`[Subscription] Gửi email hết hạn thất bại cho ${user.email}:`, emailErr.message);
        }
      } else {
        console.warn(`[Subscription] Bỏ qua gửi email hết hạn cho user #${user.id}: không có email`);
      }
    }

    // 2. Thu hồi gói (expireUserPlan)
    try {
      await expireUserPlan(user.id, queryable);
      expiredCount++;
      console.log(`[Subscription] Đã thu hồi gói của ${user.email || `user#${user.id}`} (${user.plan_name})`);
    } catch (expireErr) {
      console.error(`[Subscription] Thu hồi gói thất bại cho user #${user.id}:`, expireErr.message);
    }
  }

  return {
    expiredCount,
    emailsSent,
    totalFound: expired.length,
  };
}
