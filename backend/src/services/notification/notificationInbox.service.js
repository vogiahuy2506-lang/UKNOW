import userNotificationRepository from '../../repositories/notification/userNotification.repository.js';
import notificationPreferenceRepository from '../../repositories/notification/notificationPreference.repository.js';
import { NOTIFICATION_EVENTS, getNotificationEvent } from '../../config/notificationEventCatalog.js';
import { getEffectiveEventSettings } from './notificationDispatch.service.js';

/**
 * Chuông thông báo + tuỳ chọn email của NGƯỜI ĐANG ĐĂNG NHẬP. Mọi hàm nhận `userId` = `req.user.id` (người thao tác thật, nhân viên
 * có dòng `users` riêng) — KHÔNG phải chủ workspace (`activeContext.ownerId`).
 */

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function toNotificationDto(row) {
  return {
    id: Number(row.id),
    eventType: row.event_type,
    title: row.title,
    titleEn: row.title_en || null,
    message: row.message,
    messageEn: row.message_en || null,
    link: row.link || null,
    severity: row.severity,
    metadata: row.metadata || {},
    notificationId: row.notification_id == null ? null : Number(row.notification_id),
    read: row.read_at != null,
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}

/**
 * @param {number} userId
 * @param {{ page?: unknown, limit?: unknown, unreadOnly?: boolean }} [query]
 * @returns {Promise<{ items: object[], unreadCount: number, pagination: { page: number, limit: number, total: number, totalPages: number } }>}
 */
export async function listNotifications(userId, { page, limit, unreadOnly = false } = {}) {
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const [{ rows, total }, unreadCount] = await Promise.all([
    userNotificationRepository.list({ userId, page: safePage, limit: safeLimit, unreadOnly }),
    userNotificationRepository.countUnread(userId),
  ]);
  return {
    items: rows.map(toNotificationDto),
    unreadCount,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

/** @param {number} userId */
export async function getUnreadCount(userId) {
  return { unreadCount: await userNotificationRepository.countUnread(userId) };
}

/**
 * @param {number} userId
 * @param {string|number} notificationId
 * @returns {Promise<{ id: number, readAt: Date }>}
 * @throws {Error & { status: number }} 400 id sai dạng, 404 không có / của người khác
 */
export async function markNotificationRead(userId, notificationId) {
  const raw = String(notificationId ?? '').trim();
  if (!/^\d{1,18}$/.test(raw)) {
    throw httpError(400, 'Mã thông báo không hợp lệ');
  }
  const row = await userNotificationRepository.markRead(raw, userId);
  if (!row) {
    throw httpError(404, 'Không tìm thấy thông báo');
  }
  return { id: Number(row.id), readAt: row.read_at };
}

/** @param {number} userId */
export async function markAllNotificationsRead(userId) {
  return { updated: await userNotificationRepository.markAllRead(userId) };
}

function toPreferenceDto(event, settings, userPreference) {
  // Hiệu lực: hệ thống tắt email loại này → luôn tắt; loại không cho tắt → luôn bật; còn lại theo tuỳ chọn người dùng (mặc định bật).
  const emailEnabled = settings.emailEnabled
    && (settings.userCanDisableEmail ? userPreference !== false : true);
  return {
    eventType: event.key,
    label: event.label,
    labelEn: event.labelEn,
    description: event.description,
    inAppEnabled: settings.inAppEnabled,
    emailEnabled,
    userCanDisableEmail: settings.userCanDisableEmail,
    // FE cần để phân biệt "người dùng tự tắt" với "hệ thống tắt email loại này" (khi đó công tắc bị khoá).
    systemEmailEnabled: settings.emailEnabled,
  };
}

/**
 * Danh sách tuỳ chọn theo catalog `audience='user'`.
 *
 * @param {number} userId
 * @returns {Promise<object[]>}
 */
export async function listPreferences(userId) {
  const preferences = await notificationPreferenceRepository.listByUser(userId);
  const events = NOTIFICATION_EVENTS.filter((event) => event.audience === 'user');
  const settingsList = await Promise.all(events.map((event) => getEffectiveEventSettings(event.key)));
  return events.map((event, index) => toPreferenceDto(event, settingsList[index], preferences.get(event.key)));
}

/**
 * Đặt tuỳ chọn email của người dùng cho một loại sự kiện.
 *
 * @param {number} userId
 * @param {string} eventType
 * @param {unknown} emailEnabled
 * @returns {Promise<object>} mục tuỳ chọn sau khi cập nhật (cùng dạng `listPreferences`)
 * @throws {Error & { status: number }} 400 khi khoá không có / không thuộc người dùng / bị khoá / hệ thống đang tắt email loại này
 */
export async function setEmailPreference(userId, eventType, emailEnabled) {
  const event = getNotificationEvent(eventType);
  if (!event || event.audience !== 'user') {
    throw httpError(400, 'Loại thông báo không hợp lệ', 'NOTIFICATION_EVENT_UNKNOWN');
  }
  if (typeof emailEnabled !== 'boolean') {
    throw httpError(400, 'emailEnabled phải là boolean (true hoặc false)', 'NOTIFICATION_EMAIL_FLAG_INVALID');
  }
  const settings = await getEffectiveEventSettings(event.key);
  if (!settings.userCanDisableEmail) {
    throw httpError(400, 'Loại thông báo này luôn được gửi qua email, không thể tắt', 'NOTIFICATION_EMAIL_LOCKED');
  }
  if (!settings.emailEnabled) {
    throw httpError(400, 'Quản trị viên đã tắt email cho loại thông báo này', 'NOTIFICATION_EMAIL_DISABLED_BY_SYSTEM');
  }
  await notificationPreferenceRepository.upsert(userId, event.key, emailEnabled);
  return toPreferenceDto(event, settings, emailEnabled);
}
