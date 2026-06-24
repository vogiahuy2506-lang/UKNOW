import db from '../config/database.js';
import { isAdminRole } from './roleScope.util.js';
import { getSubscriptionStatus } from './subscriptionStatus.util.js';

const SUBSCRIPTION_EXPIRED_MSG =
  'Gói đã hết hạn (đã qua thời gian ân hạn). Vui lòng gia hạn để tiếp tục gửi.';

/**
 * Lấy giới hạn gửi tin từ plan hiện tại của user.
 * Session timezone = Asia/Ho_Chi_Minh nên CURRENT_DATE / DATE_TRUNC('month', NOW()) tự điều chỉnh múi giờ.
 */
async function getUserPlanSendLimits(userId) {
  const { rows } = await db.query(
    `SELECT p.daily_email_limit, p.monthly_email_limit,
            p.daily_zalo_limit,  p.monthly_zalo_limit
     FROM users u
     JOIN plans p ON p.id = u.active_plan_id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function countEmailSentToday(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM email_messages em
     INNER JOIN campaigns c ON c.id = em.id_campaign
     WHERE c.id_user = $1
       AND em.status IN ('sent', 'delivered', 'bounced')
       AND em.sent_at >= CURRENT_DATE`,
    [userId]
  );
  return toCount(rows[0]?.total);
}

async function countEmailSentThisMonth(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM email_messages em
     INNER JOIN campaigns c ON c.id = em.id_campaign
     WHERE c.id_user = $1
       AND em.status IN ('sent', 'delivered', 'bounced')
       AND em.sent_at >= DATE_TRUNC('month', NOW())`,
    [userId]
  );
  return toCount(rows[0]?.total);
}

async function countZaloSentToday(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM zalo_messages zm
     JOIN campaigns c ON c.id = zm.id_campaign
     WHERE c.id_user = $1
       AND zm.tracking_metadata->>'status' = 'sent'
       AND zm.sent_at >= CURRENT_DATE`,
    [userId]
  );
  return toCount(rows[0]?.total);
}

async function countZaloSentThisMonth(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM zalo_messages zm
     JOIN campaigns c ON c.id = zm.id_campaign
     WHERE c.id_user = $1
       AND zm.tracking_metadata->>'status' = 'sent'
       AND zm.sent_at >= DATE_TRUNC('month', NOW())`,
    [userId]
  );
  return toCount(rows[0]?.total);
}

const toInt = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

const toCount = (v) => Number.parseInt(v ?? 0, 10) || 0;

/**
 * Kết quả trả về:
 *   { allowed: true, limit: null, currentCount: 0, period: null, message: null }  — không giới hạn
 *   { allowed: false, limit: N, currentCount: M, period: 'daily'|'monthly', message: '...' } — vượt giới hạn
 */
const ok  = () => ({ allowed: true,  limit: null, currentCount: 0, period: null, message: null });
const deny = (limit, count, period, msg) => ({ allowed: false, limit, currentCount: count, period, message: msg });

/**
 * Kiểm tra user có còn hạn mức gửi email theo ngày/tháng của gói dịch vụ hay không.
 *
 * @param {{ userId: number|string, roleCode?: string }} input
 */
export async function checkUserEmailSendLimit({ userId, roleCode } = {}) {
  if (isAdminRole(roleCode)) return ok();

  const subscription = await getSubscriptionStatus(userId);
  if (subscription.hasPlan && subscription.isExpired) {
    return deny(null, 0, null, SUBSCRIPTION_EXPIRED_MSG);
  }

  const limits = await getUserPlanSendLimits(userId);
  if (!limits) return ok(); // Không có plan → không enforce

  const dailyLimit = toInt(limits.daily_email_limit);
  if (dailyLimit !== null) {
    if (dailyLimit === 0) {
      return deny(0, 0, 'daily', 'Tính năng gửi email không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.');
    }
    const count = await countEmailSentToday(userId);
    if (count >= dailyLimit) {
      return deny(dailyLimit, count, 'daily',
        `Đã đạt giới hạn gửi email trong ngày (${count}/${dailyLimit} email). Hạn mức sẽ reset vào 00:00 ngày mai.`);
    }
  }

  const monthlyLimit = toInt(limits.monthly_email_limit);
  if (monthlyLimit !== null) {
    if (monthlyLimit === 0) {
      return deny(0, 0, 'monthly', 'Tính năng gửi email không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.');
    }
    const count = await countEmailSentThisMonth(userId);
    if (count >= monthlyLimit) {
      return deny(monthlyLimit, count, 'monthly',
        `Đã đạt giới hạn gửi email trong tháng (${count}/${monthlyLimit} email). Vui lòng liên hệ admin để nâng gói.`);
    }
  }

  return ok();
}

/**
 * Kiểm tra user có còn hạn mức gửi Zalo theo ngày/tháng của gói dịch vụ hay không.
 *
 * @param {{ userId: number|string, roleCode?: string }} input
 */
export async function checkUserZaloSendLimit({ userId, roleCode } = {}) {
  if (isAdminRole(roleCode)) return ok();

  const subscription = await getSubscriptionStatus(userId);
  if (subscription.hasPlan && subscription.isExpired) {
    return deny(null, 0, null, SUBSCRIPTION_EXPIRED_MSG);
  }

  const limits = await getUserPlanSendLimits(userId);
  if (!limits) return ok();

  const dailyLimit = toInt(limits.daily_zalo_limit);
  if (dailyLimit !== null) {
    if (dailyLimit === 0) {
      return deny(0, 0, 'daily', 'Tính năng gửi Zalo không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.');
    }
    const count = await countZaloSentToday(userId);
    if (count >= dailyLimit) {
      return deny(dailyLimit, count, 'daily',
        `Đã đạt giới hạn gửi Zalo trong ngày (${count}/${dailyLimit} tin). Hạn mức sẽ reset vào 00:00 ngày mai.`);
    }
  }

  const monthlyLimit = toInt(limits.monthly_zalo_limit);
  if (monthlyLimit !== null) {
    if (monthlyLimit === 0) {
      return deny(0, 0, 'monthly', 'Tính năng gửi Zalo không được hỗ trợ trong gói dịch vụ hiện tại. Vui lòng liên hệ admin để nâng gói.');
    }
    const count = await countZaloSentThisMonth(userId);
    if (count >= monthlyLimit) {
      return deny(monthlyLimit, count, 'monthly',
        `Đã đạt giới hạn gửi Zalo trong tháng (${count}/${monthlyLimit} tin). Vui lòng liên hệ admin để nâng gói.`);
    }
  }

  return ok();
}
