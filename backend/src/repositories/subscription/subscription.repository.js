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
 * Lấy danh sách user_admin đã hết hạn gói (sau cả ân hạn grace_period_days).
 */
export async function findExpiredUsers(queryable = db) {
  const { rows } = await queryable.query(
    `SELECT u.id, u.email, u.full_name, p.name AS plan_name,
            u.subscription_expires_at, u.subscription_reminder_count
     FROM users u
     JOIN plans p ON u.active_plan_id = p.id
     WHERE u.role = 'user'
       AND u.subscription_expires_at IS NOT NULL
       AND NOW() > (
         u.subscription_expires_at
         + (COALESCE(p.grace_period_days, 0) || ' days')::interval
       )`,
  );
  return rows;
}

/**
 * Hết hạn gói: set active_plan_id = NULL.
 * max_* = 0 (cấm) — không NULL (NULL từng bị hiểu là vô hạn ở resource/send limit).
 */
export async function expireUserPlan(userId, queryable = db) {
  await queryable.query(
    `UPDATE users
     SET active_plan_id          = NULL,
         subscription_reminder_count = 0,
         max_landing_pages        = 0,
         max_campaigns            = 0,
         max_zalo_campaigns       = 0,
         max_zalo_group_campaigns = 0,
         max_email_campaigns      = 0,
         max_zalo_accounts        = 0,
         max_email_accounts       = 0,
         max_email_templates      = 0,
         max_zalo_templates       = 0,
         messages_per_period      = 0,
         is_fup_enabled           = FALSE,
         updated_at               = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
}

/**
 * Tăng reminder_count sau khi gửi nhắc nhở.
 */
export async function incrementReminderCount(userId, queryable = db) {
  await queryable.query(
    `UPDATE users
     SET subscription_reminder_count = subscription_reminder_count + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId]
  );
}

/**
 * PLAN_CAU_HINH_LICH_NHAC_HAN_2026-09-13.md, mục 3.4 — quét riêng cho nhắc hạn theo cấu hình
 * (subscription_reminder_settings), KHÔNG lọc theo subscription_reminder_count như
 * findExpiringUsers ở trên (hàm đó vẫn giữ nguyên semantics cũ — chỉ subscriptionExpiry.service.js
 * đã đổi sang dùng hàm này, còn subscriptionRepository.test.js vẫn kiểm findExpiringUsers riêng).
 * Cơ chế chống gửi lặp cho nhánh này là cột subscription_reminders_sent, lọc ở tầng service.
 *
 * @param {number} minDays  số ngày tối thiểu còn lại (loại trừ)
 * @param {number} maxDays  số ngày tối đa còn lại (bao gồm)
 */
export async function findUsersExpiringInWindow(minDays, maxDays, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT u.id, u.email, u.full_name, p.name AS plan_name, u.subscription_expires_at,
            u.subscription_reminders_sent
     FROM users u
     JOIN plans p ON u.active_plan_id = p.id
     WHERE u.role = 'user'
       AND u.status = 'active'
       AND u.subscription_expires_at IS NOT NULL
       AND u.subscription_expires_at <= NOW() + ($2 || ' days')::INTERVAL
       AND u.subscription_expires_at > NOW() + ($1 || ' days')::INTERVAL`,
    [minDays, maxDays]
  );
  return rows;
}

/**
 * Ghi nhận đã gửi nhắc hạn — thay object subscription_reminders_sent bằng bản đã tính sẵn ở
 * service (parse/so cycle/gộp mốc đều làm trong JS, không đụng jsonb operator trong SQL).
 */
export async function markReminderSent(userId, sentRecord, queryable = db) {
  await queryable.query(
    `UPDATE users
     SET subscription_reminders_sent = $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId, JSON.stringify(sentRecord)]
  );
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
