import db from '../../config/database.js';

/**
 * Lấy danh sách user_admin có gói sắp hết hạn trong khoảng [minDays, maxDays] ngày tới.
 * Chỉ lấy user chưa gửi reminder ở ngưỡng này (dựa vào reminder_count).
 *
 * @param {number} minDays  số ngày tối thiểu còn lại
 * @param {number} maxDays  số ngày tối đa còn lại
 * @param {number} reminderThreshold  reminder_count phải < threshold thì mới gửi
 */
export async function findExpiringUsers(minDays, maxDays, reminderThreshold) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.full_name, p.name AS plan_name, u.subscription_expires_at,
            u.subscription_reminder_count
     FROM users u
     JOIN plans p ON u.active_plan_id = p.id
     WHERE u.role = 'user'
       AND u.status = 'active'
       AND u.subscription_expires_at IS NOT NULL
       AND u.subscription_expires_at > NOW()
       AND u.subscription_expires_at <= NOW() + ($2 || ' days')::INTERVAL
       AND u.subscription_expires_at > NOW() + ($1 || ' days')::INTERVAL
       AND u.subscription_reminder_count < $3`,
    [minDays, maxDays, reminderThreshold]
  );
  return rows;
}

/**
 * Lấy danh sách user_admin đã hết hạn gói (subscription_expires_at < NOW()).
 */
export async function findExpiredUsers() {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.full_name, p.name AS plan_name
     FROM users u
     JOIN plans p ON u.active_plan_id = p.id
     WHERE u.role = 'user'
       AND u.subscription_expires_at IS NOT NULL
       AND u.subscription_expires_at < NOW()`,
  );
  return rows;
}

/**
 * Hết hạn gói: set active_plan_id = NULL, giữ lại subscription_expires_at để biết user là khách cũ.
 */
export async function expireUserPlan(userId) {
  await db.query(
    `UPDATE users
     SET active_plan_id          = NULL,
         subscription_reminder_count = 0,
         max_landing_pages        = NULL,
         max_campaigns            = NULL,
         max_zalo_accounts        = NULL,
         max_email_accounts       = NULL,
         max_email_templates      = NULL,
         max_zalo_templates       = NULL,
         updated_at               = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Tăng reminder_count sau khi gửi nhắc nhở.
 */
export async function incrementReminderCount(userId) {
  await db.query(
    `UPDATE users
     SET subscription_reminder_count = subscription_reminder_count + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Gán gói + set subscription_expires_at khi admin gán thủ công hoặc webhook PayOS.
 * Nếu user còn thời hạn cũ chưa hết → gia hạn từ ngày hết hạn cũ (không mất ngày).
 * Nếu đã hết hạn hoặc chưa có → tính từ NOW().
 *
 * @param {number} userId
 * @param {number} planId
 */
export async function assignPlanWithExpiry(userId, planId) {
  const { rows } = await db.query(
    `UPDATE users
     SET active_plan_id = $1,
         subscription_expires_at = CASE
           WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
             THEN subscription_expires_at + INTERVAL '1 month'
           ELSE NOW() + INTERVAL '1 month'
         END,
         subscription_reminder_count = 0,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, email, active_plan_id, subscription_expires_at`,
    [planId, userId]
  );
  return rows[0] || null;
}

/**
 * Kiểm tra xem user đã từng mua gói chưa (khách cũ) — dựa vào lịch sử orders.
 */
export async function isReturningCustomer(userId) {
  const { rows } = await db.query(
    `SELECT 1 FROM orders WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}
