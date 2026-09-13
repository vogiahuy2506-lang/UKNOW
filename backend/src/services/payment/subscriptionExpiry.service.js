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
          // Lỗi gửi email cho 1 người không được làm hỏng cả lượt cron,
          // và KHÔNG incrementReminderCount để tránh mất thư vĩnh viễn
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
