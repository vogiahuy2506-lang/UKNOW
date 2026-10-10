import { NOTIFICATION_EVENTS, getNotificationEvent } from '../../config/notificationEventCatalog.js';
import notificationEventSettingRepository from '../../repositories/notification/notificationEventSetting.repository.js';
import { clearEventSettingsCache } from './notificationDispatch.service.js';

/**
 * Cấu hình HỆ THỐNG theo sự kiện thông báo — màn của super admin (`/api/admin/notification-events`).
 */

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function toEntry(event, row) {
  return {
    key: event.key,
    label: event.label,
    labelEn: event.labelEn,
    description: event.description,
    audience: event.audience,
    defaults: { inApp: event.defaults.inApp, email: event.defaults.email },
    catalogUserCanDisableEmail: event.userCanDisableEmail,
    settings: {
      inAppEnabled: row ? row.inAppEnabled : event.defaults.inApp,
      emailEnabled: row ? row.emailEnabled : event.defaults.email,
      userCanDisableEmail: row ? row.userCanDisableEmail : event.userCanDisableEmail,
      updatedBy: row ? row.updatedBy : null,
      updatedAt: row ? row.updatedAt : null,
      isDefault: !row,
    },
  };
}

/**
 * Đọc thẳng DB (không qua cache của dispatcher) để màn admin luôn thấy giá trị mới nhất.
 *
 * @returns {Promise<object[]>} catalog + cấu hình hiệu lực
 */
export async function listEventSettings() {
  const rows = await notificationEventSettingRepository.listAll();
  const byEvent = new Map(rows.map((row) => [row.eventType, row]));
  return NOTIFICATION_EVENTS.map((event) => toEntry(event, byEvent.get(event.key)));
}

/**
 * @param {string} eventType
 * @param {{ inAppEnabled?: unknown, emailEnabled?: unknown, userCanDisableEmail?: unknown }} body mỗi trường có thì phải là boolean; thiếu thì giữ giá trị hiện tại
 * @param {number} adminId
 * @returns {Promise<object>} mục sau khi cập nhật
 * @throws {Error & { status: number }} 404 khoá không có trong catalog; 400 body sai
 */
export async function updateEventSettings(eventType, body, adminId) {
  const event = getNotificationEvent(eventType);
  if (!event) {
    throw httpError(404, 'Không tìm thấy loại thông báo');
  }
  const fields = ['inAppEnabled', 'emailEnabled', 'userCanDisableEmail'];
  const provided = fields.filter((field) => body?.[field] !== undefined);
  if (!provided.length) {
    throw httpError(400, 'Cần ít nhất một trong inAppEnabled, emailEnabled, userCanDisableEmail');
  }
  for (const field of provided) {
    if (typeof body[field] !== 'boolean') {
      throw httpError(400, `${field} phải là boolean (true hoặc false)`);
    }
  }
  const rows = await notificationEventSettingRepository.listAll();
  const current = rows.find((row) => row.eventType === event.key);
  const next = {
    inAppEnabled: body.inAppEnabled ?? (current ? current.inAppEnabled : event.defaults.inApp),
    emailEnabled: body.emailEnabled ?? (current ? current.emailEnabled : event.defaults.email),
    userCanDisableEmail: body.userCanDisableEmail ?? (current ? current.userCanDisableEmail : event.userCanDisableEmail),
  };
  await notificationEventSettingRepository.upsert({
    eventType: event.key,
    ...next,
    updatedBy: Number.isSafeInteger(Number(adminId)) ? Number(adminId) : null,
  });
  // Dispatcher cache trong tiến trình 60 giây — xoá ngay để cấu hình mới có hiệu lực tức thì.
  clearEventSettingsCache();
  const updatedRows = await notificationEventSettingRepository.listAll();
  return toEntry(event, updatedRows.find((row) => row.eventType === event.key));
}
