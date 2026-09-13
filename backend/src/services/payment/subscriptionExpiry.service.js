import db from '../../config/database.js';
import {
  findExpiredUsers,
  findExpiringUsers,
  expireUserPlan,
  incrementReminderCount,
} from '../../repositories/subscription/subscription.repository.js';
import {
  buildPlanExpiredEmail,
  buildRenewalReminderEmail,
  sendSystemEmail,
} from '../../utils/systemEmail.util.js';
import { loadCustomSystemEmailTemplate } from '../email/welcomeEmailTemplate.service.js';

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

  // PR-2b (13/09/2026, mục 4.2 Việc 6) — đọc mẫu plan_expired do super admin sửa (nếu có) MỘT
  // lần cho cả lượt cron, dùng chung cho mọi user hết hạn trong lượt này. Trả null khi chưa ai
  // sửa hoặc DB lỗi tạm thời; buildPlanExpiredEmail tự ngã về bản cứng khi template=null.
  const planExpiredTemplate = await loadCustomSystemEmailTemplate('plan_expired');

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
            template: planExpiredTemplate,
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

/**
 * Gửi email nhắc nhở sắp hết hạn gói (7 ngày và 3 ngày):
 * 1. Đọc mẫu 'plan_expiring' tuỳ chỉnh một lần cho cả lượt.
 * 2. Nhắc lần 1 (còn 7 ngày, reminder_count = 0, findExpiringUsers(6, 7, 1)).
 * 3. Nhắc lần 2 (còn 3 ngày, reminder_count = 1, findExpiringUsers(2, 3, 2)).
 * 4. Bọc try/catch cho từng user: lỗi 1 user không làm đứt chuỗi và không ảnh hưởng người khác.
 * 5. Chỉ incrementReminderCount khi gửi email thành công.
 *
 * @param {{ renewalUrl?: string, queryable?: object }} [options]
 * @returns {Promise<{ remindedWeek: number, remindedThreeDay: number, failed: number }>}
 */
export async function sendExpiringReminders({ renewalUrl, queryable = db } = {}) {
  const planExpiringTemplate = await loadCustomSystemEmailTemplate('plan_expiring');
  let remindedWeek = 0;
  let remindedThreeDay = 0;
  let failed = 0;

  // 1. Nhắc lần 1 — còn 7 ngày (reminder_count = 0)
  const week = await findExpiringUsers(6, 7, 1);
  for (const user of week) {
    try {
      const daysLeft = Math.ceil((new Date(user.subscription_expires_at) - Date.now()) / 86400000);
      const { subject, html } = buildRenewalReminderEmail({
        fullName: user.full_name,
        planName: user.plan_name,
        expiresAt: user.subscription_expires_at,
        daysLeft,
        renewalUrl,
        template: planExpiringTemplate,
      });
      await sendSystemEmail({ to: user.email, subject, html });
      await incrementReminderCount(user.id, queryable);
      remindedWeek++;
      console.log(`[Subscription] Nhắc lần 1 → ${user.email} (còn ${daysLeft} ngày)`);
    } catch (err) {
      failed++;
      console.error(`[Subscription] Gửi email nhắc hạn lần 1 thất bại cho ${user.email}:`, err.message);
    }
  }

  // 2. Nhắc lần 2 — còn 3 ngày (reminder_count = 1)
  const threeDay = await findExpiringUsers(2, 3, 2);
  for (const user of threeDay) {
    try {
      const daysLeft = Math.ceil((new Date(user.subscription_expires_at) - Date.now()) / 86400000);
      const { subject, html } = buildRenewalReminderEmail({
        fullName: user.full_name,
        planName: user.plan_name,
        expiresAt: user.subscription_expires_at,
        daysLeft,
        renewalUrl,
        template: planExpiringTemplate,
      });
      await sendSystemEmail({ to: user.email, subject, html });
      await incrementReminderCount(user.id, queryable);
      remindedThreeDay++;
      console.log(`[Subscription] Nhắc lần 2 → ${user.email} (còn ${daysLeft} ngày)`);
    } catch (err) {
      failed++;
      console.error(`[Subscription] Gửi email nhắc hạn lần 2 thất bại cho ${user.email}:`, err.message);
    }
  }

  return {
    remindedWeek,
    remindedThreeDay,
    failed,
  };
}


/**
 * Dựng object kết quả ghi vào `cron_job_runs` cho job `subscription_reminder`.
 *
 * Tách khỏi thân cron vì ca nghiệm thu 8 của plan ("dòng cron_job_runs có đủ 5 khoá giám sát")
 * trước đây KHÔNG kiểm được: cả test unit lẫn test integration đều tự dựng lại object này trong
 * test rồi so với chính nó. Đột biến 13/09/2026 chứng minh: đổi tên khoá `remindedWeek` ngay
 * trong scheduler.js thì 2720 test unit + 6 test integration VẪN XANH.
 *
 * Năm khoá `expired`, `remindedWeek`, `remindedThreeDay`, `lockedUsers`, `synced` là hợp đồng với
 * bảng giám sát — đổi tên chúng là làm mù dashboard, nên phải có chỗ canh.
 *
 * @param {{
 *   expiryResult: { expiredCount?: number },
 *   reminderResult: { remindedWeek?: number, remindedThreeDay?: number },
 *   lockedUsers?: number,
 *   reminderWeek?: number,
 *   reminderThree?: number,
 * }} input
 * @returns {{ expired: number, remindedWeek: number, remindedThreeDay: number,
 *   lockedUsers: number, reminderWeek: number, reminderThree: number, synced: number }}
 */
export function buildSubscriptionCronResult({
  expiryResult = {},
  reminderResult = {},
  lockedUsers = 0,
  reminderWeek = 0,
  reminderThree = 0,
} = {}) {
  const expired = Number(expiryResult.expiredCount) || 0;
  const remindedWeek = Number(reminderResult.remindedWeek) || 0;
  const remindedThreeDay = Number(reminderResult.remindedThreeDay) || 0;

  return {
    expired,
    remindedWeek,
    remindedThreeDay,
    lockedUsers,
    reminderWeek,
    reminderThree,
    synced: expired + remindedWeek + remindedThreeDay + lockedUsers + reminderWeek + reminderThree,
  };
}
