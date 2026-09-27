import db from '../../config/database.js';
import { scheduledPlanChangeRepository } from '../../repositories/payment/scheduledPlanChange.repository.js';
import {
  activateUserPlan,
  findNewerSuccessfulPlanCheckout,
} from '../../repositories/payment/payment.repository.js';
import { lockUserForPlanActivation } from '../../repositories/user/user.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';
import { escapeHtml } from '../../utils/htmlEscape.util.js';

/**
 * Get active pending scheduled change for a user.
 */
export async function getPendingScheduledChange(userId) {
  if (!userId) return null;
  return scheduledPlanChangeRepository.findPendingByUserId(userId);
}

/** "dd/MM/yyyy HH:mm" theo giờ VN — timeZone cố định, không phụ thuộc TZ tiến trình (production
 * chạy UTC, xem project_email_sent_at_luu_gio_utc). */
function formatVnDateTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(date));
}

/**
 * Cancel a pending scheduled plan change.
 */
export async function cancelPendingScheduledChange(userId, changeId = null) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const lockedUser = await lockUserForPlanActivation(userId, client);
    if (!lockedUser) {
      throw { status: 404, message: 'Không tìm thấy tài khoản' };
    }

    const pending = await scheduledPlanChangeRepository.findPendingByUserId(userId, client);
    if (!pending) {
      throw { status: 404, message: 'Không tìm thấy lệnh hẹn đổi gói đang chờ' };
    }
    if (changeId && Number(pending.id) !== Number(changeId)) {
      throw { status: 400, message: 'ID lệnh hẹn không khớp' };
    }

    const superseded = await scheduledPlanChangeRepository.supersedePendingById(pending.id, client);
    if (!superseded) {
      throw { status: 409, message: 'Lệnh hẹn đã được xử lý, vui lòng làm mới dữ liệu' };
    }

    await client.query('COMMIT');
    return { success: true, message: 'Đã huỷ lệnh hẹn đổi gói thành công' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Activate all due scheduled plan changes.
 * Called periodically by cron job.
 */
export async function processDueScheduledPlanChanges() {
  const dueChanges = await scheduledPlanChangeRepository.findDueChanges();
  if (!dueChanges || dueChanges.length === 0) {
    return { processed: 0 };
  }

  let processedCount = 0;
  for (const item of dueChanges) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // Every entitlement writer takes the user lock first. This serializes a
      // due worker with cancellation and paid scheduling, avoiding the former
      // check-then-act race from the initial due-list scan.
      const lockedUser = await lockUserForPlanActivation(item.user_id, client);
      if (!lockedUser) {
        throw new Error(`Không tìm thấy tài khoản ${item.user_id}`);
      }

      const claimed = await scheduledPlanChangeRepository.claimDueChange(
        item.id,
        item.user_id,
        client,
      );
      if (!claimed) {
        await client.query('COMMIT');
        continue;
      }

      // `orders.id` expresses checkout intent. If another successful plan
      // checkout was created later, this older scheduled instruction must not
      // overwrite it merely because the worker happened to run last.
      const newerCheckout = claimed.order_id
        ? await findNewerSuccessfulPlanCheckout({
          userId: claimed.user_id,
          orderId: claimed.order_id,
          queryable: client,
        })
        : null;
      if (newerCheckout) {
        await scheduledPlanChangeRepository.supersedePendingById(claimed.id, client);
        await client.query('COMMIT');
        console.warn(
          `[ScheduledPlanChange] Superseded due change #${claimed.id}; newer successful checkout ${newerCheckout.newer_successful_order_code} wins.`
        );
        continue;
      }

      // PR-3 (đợt rà soát 26/09), Việc 2.1 — ghi cấu hình MỚI (đã trả tiền cho lệnh hẹn này) vào
      // plans TRƯỚC khi activateUserPlan copy hàng plans sang user. Không có bước này thì gói Tùy
      // chọn hạ xuống nhỏ vẫn kích hoạt với hạn mức/giá CŨ (đã lớn hơn) mỗi kỳ, không bao giờ hạ
      // được thật. Chỉ áp dụng cho lệnh hẹn của gói Tùy chọn — lệnh hẹn gói cố định không có
      // custom_plan_config (LEFT JOIN ở claimDueChange trả null), bỏ qua đúng như trước đây.
      let customConfig = claimed.custom_plan_config;
      if (typeof customConfig === 'string') {
        try {
          customConfig = JSON.parse(customConfig);
        } catch {
          customConfig = null;
        }
      }
      if (customConfig && typeof customConfig === 'object') {
        const { updateCustomPlanLimits } = await import('../../repositories/payment/customPlan.repository.js');
        await updateCustomPlanLimits(claimed.plan_id, customConfig, client);
      }

      // 1. Activate plan for user
      await activateUserPlan(claimed.user_id, claimed.plan_id, claimed.billing_period || 'monthly', client);

      // Set 7-day grace period for resource locking on downgrade
      const { rows: graceRows } = await client.query(
        `UPDATE users SET overage_grace_until = NOW() + INTERVAL '7 days' WHERE id = $1
         RETURNING overage_grace_until`,
        [claimed.user_id]
      );
      const overageGraceUntil = graceRows[0]?.overage_grace_until || null;

      // 2. Mark scheduled change as activated
      const activated = await scheduledPlanChangeRepository.markActivated(claimed.id, client);
      if (!activated) {
        throw new Error(`Lệnh hẹn #${claimed.id} không còn ở trạng thái pending`);
      }

      // 3. Reconcile resource locks (unlock resources)
      const { reconcileResourceLocks } = await import('./topupLock.service.js');
      await reconcileResourceLocks(claimed.user_id, client, { unlockOnly: true });

      await client.query('COMMIT');
      processedCount++;

      // 4. Send notification email
      if (claimed.user_email) {
        // Tiêu đề thư là văn bản thường (không phải HTML) — dùng tên gói thô; chỉ thân thư mới escape.
        const planName = escapeHtml(claimed.plan_name);
        const fullName = escapeHtml(claimed.user_full_name || 'Quý khách');
        const periodLabel = claimed.billing_period === 'yearly' ? 'Theo năm' : 'Theo tháng';

        // Có vượt hạn mức sau khi hạ gói -> nhắc rõ hạn 7 ngày ân hạn (Việc 3). computeOverage chỉ
        // đọc, dùng pool `db` (client transaction ở trên đã release ngay sau COMMIT) — LỖI ở đây
        // KHÔNG được nuốt mất thư kích hoạt, chỉ log rồi gửi thư không có đoạn cảnh báo vượt.
        let overageHtml = '';
        try {
          const { computeOverage, structuralItemLabelVi } = await import('./topupLock.service.js');
          const overages = await computeOverage(claimed.user_id, db);
          if (overages.length > 0) {
            const detail = overages.map((o) => `${o.over} ${structuralItemLabelVi(o.resourceKey)}`).join(', ');
            const deadlineStr = formatVnDateTime(overageGraceUntil);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
            overageHtml = `<p>Gói mới cho phép ít tài nguyên hơn bạn đang dùng: vượt <strong>${detail}</strong>. `
              + `Bạn có 7 ngày, tới <strong>${deadlineStr}</strong>, để chọn giữ lại cái nào `
              + `(<a href="${frontendUrl}/app/billing?tab=locks">chọn tài nguyên giữ lại</a>) hoặc `
              + `<a href="${frontendUrl}/app/topup">mua thêm</a>. Sau hạn này hệ thống tự khoá phần vượt, `
              + `cái tạo gần nhất bị khoá trước.</p>`;
          }
        } catch (err) {
          console.error('[ScheduledPlanChange] computeOverage failed:', err.message);
        }

        sendSystemEmail({
          to: claimed.user_email,
          subject: `[Founder AI] Lệnh hẹn đổi sang gói ${claimed.plan_name} đã được kích hoạt`,
          html: `<p>Xin chào <strong>${fullName}</strong>,</p>
<p>Lệnh hẹn đổi gói sang <strong>${planName}</strong> (${periodLabel}) của bạn đã đến hạn và được kích hoạt thành công.</p>
${overageHtml}
<p>Cảm ơn bạn đã tin tưởng và sử dụng dịch vụ của Founder AI!</p>`,
        }).catch((err) => console.error('[ScheduledPlanChange] Failed to send email:', err.message));
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[ScheduledPlanChange] Lỗi khi kích hoạt lệnh hẹn #${item.id} cho user #${item.user_id}:`, err);
    } finally {
      client.release();
    }
  }

  return { processed: processedCount };
}
