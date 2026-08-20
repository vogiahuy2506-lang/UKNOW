import db from '../../config/database.js';
import { scheduledPlanChangeRepository } from '../../repositories/payment/scheduledPlanChange.repository.js';
import { activateUserPlan } from '../../repositories/payment/payment.repository.js';
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
  const pending = await scheduledPlanChangeRepository.findPendingByUserId(userId);
  if (!pending) {
    throw { status: 404, message: 'Không tìm thấy lệnh hẹn đổi gói đang chờ' };
  }
  if (changeId && Number(pending.id) !== Number(changeId)) {
    throw { status: 400, message: 'ID lệnh hẹn không khớp' };
  }

  // Cancel pending changes for this user
  await scheduledPlanChangeRepository.supersedePendingByUserId(userId);
  return { success: true, message: 'Đã huỷ lệnh hẹn đổi gói thành công' };
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

      // 1. Activate plan for user
      await activateUserPlan(item.user_id, item.plan_id, item.billing_period || 'monthly', client);

      // 2. Mark scheduled change as activated
      await scheduledPlanChangeRepository.markActivated(item.id, client);

      // 3. Reconcile resource locks (unlock resources)
      const { reconcileResourceLocks } = await import('./topupLock.service.js');
      await reconcileResourceLocks(item.user_id, client, { unlockOnly: true });

      await client.query('COMMIT');
      processedCount++;

      // 4. Send notification email
      if (item.user_email) {
        sendSystemEmail({
          to: item.user_email,
          subject: `[UKNOW] Lệnh hẹn đổi sang gói ${item.plan_name} đã được kích hoạt`,
          html: `<p>Xin chào <strong>${item.user_full_name || 'Quý khách'}</strong>,</p>
<p>Lệnh hẹn đổi gói sang <strong>${item.plan_name}</strong> (${item.billing_period === 'yearly' ? 'Theo năm' : 'Theo tháng'}) của bạn đã đến hạn và được kích hoạt thành công.</p>
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
