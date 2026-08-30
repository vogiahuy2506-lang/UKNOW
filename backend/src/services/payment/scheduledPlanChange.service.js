import db from '../../config/database.js';
import { scheduledPlanChangeRepository } from '../../repositories/payment/scheduledPlanChange.repository.js';
import {
  activateUserPlan,
  findNewerSuccessfulPlanCheckout,
} from '../../repositories/payment/payment.repository.js';
import { lockUserForPlanActivation } from '../../repositories/user/user.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';

/**
 * Get active pending scheduled change for a user.
 */
export async function getPendingScheduledChange(userId) {
  if (!userId) return null;
  return scheduledPlanChangeRepository.findPendingByUserId(userId);
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

      // 1. Activate plan for user
      await activateUserPlan(claimed.user_id, claimed.plan_id, claimed.billing_period || 'monthly', client);

      // Set 7-day grace period for resource locking on downgrade
      await client.query(
        `UPDATE users SET overage_grace_until = NOW() + INTERVAL '7 days' WHERE id = $1`,
        [claimed.user_id]
      );

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
        sendSystemEmail({
          to: claimed.user_email,
          subject: `[UKNOW] Lệnh hẹn đổi sang gói ${claimed.plan_name} đã được kích hoạt`,
          html: `<p>Xin chào <strong>${claimed.user_full_name || 'Quý khách'}</strong>,</p>
<p>Lệnh hẹn đổi gói sang <strong>${claimed.plan_name}</strong> (${claimed.billing_period === 'yearly' ? 'Theo năm' : 'Theo tháng'}) của bạn đã đến hạn và được kích hoạt thành công.</p>
<p>Cảm ơn bạn đã tin tưởng và sử dụng dịch vụ của UKNOW!</p>`,
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
