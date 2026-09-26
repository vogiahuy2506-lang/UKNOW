import db from '../../config/database.js';
import {
  findExpiredUsers,
  findUsersExpiringInWindow,
  expireUserPlan,
  incrementReminderCount,
  markReminderSent,
} from '../../repositories/subscription/subscription.repository.js';
import {
  buildPlanExpiredEmail,
  buildRenewalReminderEmail,
  sendSystemEmail,
} from '../../utils/systemEmail.util.js';
import { loadCustomSystemEmailTemplate } from '../email/welcomeEmailTemplate.service.js';
import { getReminderSettings } from './subscriptionReminderSettings.service.js';
import { reconcileResourceLocks } from './topupLock.service.js';

/**
 * Xử lý các gói thuê bao đã hết hạn:
 * 1. Quét danh sách user có gói hết hạn (sau cả thời gian ân hạn).
 * 2. Gửi email thông báo hết hạn T-0 (nếu reminder_count < 3 và có email) TRƯỚC KHI thu hồi gói.
 * 3. Tăng reminder_count sau khi gửi email thành công.
 * 4. Thu hồi gói (expireUserPlan).
 * 5. Khoá NGAY tài nguyên vượt trần (PR-3, Việc 3.1) — xem chú thích tại nơi gọi.
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

      // PR-3, Việc 3.1 — khoá tài nguyên vượt trần NGAY tại đây, không đợi cron reconcile
      // (`topupLock.service.js` reconcileAllDueUsers) chạy sau. Lý do bắt buộc gọi ở ĐÂY, SAU
      // expireUserPlan (không phải trước): reconcileResourceLocks đọc trần hiệu dụng từ chính các
      // cột users.max_* mà expireUserPlan vừa đặt về 0 — gọi trước khi gỡ gói sẽ đọc trần của gói
      // ĐANG TRẢ TIỀN (chưa bị 0 hoá) nên không khoá được gì. Và không thể chờ reconcileAllDueUsers
      // ở lượt cron kế tiếp: findExpiredUsers (được nó gọi lại) JOIN u.active_plan_id = p.id nên
      // user vừa bị NULL hoá active_plan_id ở dòng trên biến mất khỏi danh sách "hết hạn" ngay lập
      // tức — đây chính là gốc lỗi 3.1 (khách hết hạn nhưng landing/chatbot không bao giờ bị khoá).
      try {
        await reconcileResourceLocks(user.id, queryable);
      } catch (lockErr) {
        // Lỗi khoá không được xoá mất việc đã thu hồi gói (expiredCount đã tính ở trên).
        console.error(`[Subscription] Khoá tài nguyên thất bại cho user #${user.id} sau khi hết hạn:`, lockErr.message);
      }
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

// PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 1.3/3.2 — subscription_reminder_count (một số
// đếm) hỏng khi danh sách mốc đổi: đổi cấu hình [7,3] → [3] thì count=1 (đã nhận mốc 7) chặn
// nhầm mốc 3 (đòi count<1). Thay bằng ghi nhớ ĐÃ GỬI MỐC NÀO trong CHU KỲ nào
// (users.subscription_reminders_sent = {cycle, days}) — hỏi "mốc 7 đã gửi chưa" thay vì "đã gửi
// mấy lần". cycle khác subscription_expires_at hiện tại (khách gia hạn/đổi gói) → coi days cũ là
// rỗng, tự dọn không cần cron riêng.
function parseSentRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { cycle: null, days: [] };
  const days = Array.isArray(raw.days) ? raw.days.filter(Number.isInteger) : [];
  return { cycle: raw.cycle ?? null, days };
}

function isSameCycle(sentRecord, expiresAt) {
  if (!sentRecord.cycle) return false;
  return new Date(sentRecord.cycle).getTime() === new Date(expiresAt).getTime();
}

function hasSentDay(rawSent, expiresAt, day) {
  const record = parseSentRecord(rawSent);
  return isSameCycle(record, expiresAt) && record.days.includes(day);
}

function buildSentRecordAfterSend(rawSent, expiresAt, day) {
  const record = parseSentRecord(rawSent);
  const priorDays = isSameCycle(record, expiresAt) ? record.days : [];
  return { cycle: new Date(expiresAt).toISOString(), days: [...priorDays, day] };
}

/**
 * Gửi email nhắc nhở sắp hết hạn gói theo danh sách mốc cấu hình được (mặc định [7,3], xem
 * subscriptionReminderSettings.service.js):
 * 1. Đọc mẫu 'plan_expiring' tuỳ chỉnh + danh sách mốc, MỘT lần cho cả lượt cron.
 * 2. Với mỗi mốc `d` (sắp giảm dần): quét user hết hạn trong cửa sổ (d-1, d] — rộng đúng 24 giờ,
 *    khớp chu kỳ cron chạy mỗi ngày một lần (cửa sổ (d, d) rộng 0 giây sẽ không ai được gửi).
 * 3. Lọc tiếp bằng subscription_reminders_sent — mốc đã gửi trong chu kỳ hiện tại thì bỏ qua.
 * 4. Bọc try/catch cho từng user: lỗi 1 user không làm đứt chuỗi và không ảnh hưởng người khác.
 * 5. Chỉ markReminderSent khi gửi email thành công. KHÔNG còn dùng subscription_reminder_count
 *    cho nhánh này — cột đó giờ chỉ còn processExpiredSubscriptions (thư T-0) đọc/ghi.
 *
 * remindedWeek/remindedThreeDay giữ tên cũ vì đó là hợp đồng với cron_job_runs/dashboard giám sát
 * (buildSubscriptionCronResult) — với cấu hình mặc định [7,3] (2 mốc, chưa đổi gì) hai số này
 * đúng nghĩa "nhắc 7 ngày"/"nhắc 3 ngày" như hôm nay. Khi admin cấu hình nhiều hơn 2 mốc (PR-2,
 * chưa làm ở PR-1 này), remindedWeek gộp mốc XA NHẤT, remindedThreeDay gộp TẤT CẢ mốc còn lại —
 * không mất số liệu (synced vẫn cộng đúng), nhưng không tách riêng được mốc 3/4/5. Đây là giới
 * hạn thật của hợp đồng 2-khoá cũ, plan không nói tới; nêu ở báo cáo.
 *
 * @param {{ renewalUrl?: string, queryable?: object }} [options]
 * @returns {Promise<{ remindedWeek: number, remindedThreeDay: number, failed: number }>}
 */
export async function sendExpiringReminders({ renewalUrl, queryable = db } = {}) {
  const [planExpiringTemplate, { daysBefore }] = await Promise.all([
    loadCustomSystemEmailTemplate('plan_expiring'),
    getReminderSettings(),
  ]);
  let remindedWeek = 0;
  let remindedThreeDay = 0;
  let failed = 0;

  for (let index = 0; index < daysBefore.length; index += 1) {
    const day = daysBefore[index];
    const candidates = await findUsersExpiringInWindow(day - 1, day, queryable);
    for (const user of candidates) {
      if (hasSentDay(user.subscription_reminders_sent, user.subscription_expires_at, day)) continue;
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
        await markReminderSent(
          user.id,
          buildSentRecordAfterSend(user.subscription_reminders_sent, user.subscription_expires_at, day),
          queryable
        );
        if (index === 0) remindedWeek++;
        else remindedThreeDay++;
        console.log(`[Subscription] Nhắc mốc ${day} ngày → ${user.email} (còn ${daysLeft} ngày)`);
      } catch (err) {
        failed++;
        console.error(`[Subscription] Gửi email nhắc hạn mốc ${day} ngày thất bại cho ${user.email}:`, err.message);
      }
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
