import userNotificationRepository from '../../repositories/notification/userNotification.repository.js';

const DEFAULT_READ_DAYS = 90;
const DEFAULT_UNREAD_DAYS = 180;

function positiveIntFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Cron `user_notifications_cleanup` (03:10 hằng ngày): xoá thông báo đã đọc quá 90 ngày, chưa đọc quá 180 ngày.
 * Đổi ngưỡng bằng env `NOTIFICATION_RETENTION_READ_DAYS` / `NOTIFICATION_RETENTION_UNREAD_DAYS`.
 *
 * @returns {Promise<{ readDeleted: number, unreadDeleted: number, readDays: number, unreadDays: number }>}
 */
export async function cleanupUserNotifications() {
  const readDays = positiveIntFromEnv('NOTIFICATION_RETENTION_READ_DAYS', DEFAULT_READ_DAYS);
  const unreadDays = positiveIntFromEnv('NOTIFICATION_RETENTION_UNREAD_DAYS', DEFAULT_UNREAD_DAYS);
  const { readDeleted, unreadDeleted } = await userNotificationRepository.deleteExpired({ readDays, unreadDays });
  return { readDeleted, unreadDeleted, readDays, unreadDays };
}
