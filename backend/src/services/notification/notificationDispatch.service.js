import {
  getNotificationEvent,
  getDefaultEventSettings,
} from '../../config/notificationEventCatalog.js';
import userNotificationRepository from '../../repositories/notification/userNotification.repository.js';
import notificationPreferenceRepository from '../../repositories/notification/notificationPreference.repository.js';
import notificationEventSettingRepository from '../../repositories/notification/notificationEventSetting.repository.js';
import { sendSystemEmail, buildNotificationEmail } from '../../utils/systemEmail.util.js';

/**
 * Bộ phát thông báo (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 2.3) — MỘT cửa chung cho chuông (in-app) + email của mọi
 * sự kiện trong config/notificationEventCatalog.js.
 *
 * Quy tắc:
 *  - Cấu hình hiệu lực của sự kiện = dòng `notification_event_settings` (super admin đặt) hoặc mặc định trong catalog khi thiếu dòng.
 *    Cache trong tiến trình 60 giây; `clearEventSettingsCache()` cho PUT của admin và test.
 *  - In-app: MỘT câu `INSERT … SELECT unnest(...)` cho cả nhóm. `dedupeKey` chung cho cả nhóm, khoá unique theo (user, key) nên mỗi
 *    người một dòng, gọi lại cùng sự kiện không sinh dòng thứ hai.
 *  - Email: chỉ gửi cho người MỚI được chèn dòng (có dedupeKey) — gọi lại cùng sự kiện không gửi email lần hai. Người đã tắt email
 *    loại này (`notification_preferences`) bị bỏ NẾU `user_can_disable_email` đang bật. Lỗi gửi chỉ log, KHÔNG ném.
 *  - Thông báo KHÔNG được làm hỏng nghiệp vụ chính: caller luôn `.catch(log)`. Riêng lỗi ghi in-app không chặn đường email
 *    (email là hành vi sẵn có của các sự kiện chiến dịch trước khi có chuông).
 *  - `sendSystemEmail` tự no-op khi NODE_ENV=test; spec mock `sendSystemEmail`, không mock nodemailer.
 */

const SETTINGS_CACHE_TTL_MS = 60 * 1000;
const EMAIL_CONCURRENCY = 5;
const TITLE_MAX = 255;
const LINK_MAX = 500;
const DEDUPE_KEY_MAX = 120;
const DEFAULT_CHANNELS = Object.freeze(['in_app', 'email']);
const SEVERITIES = new Set(['info', 'success', 'warning', 'error']);

/** @type {{ loadedAt: number, byEvent: Map<string, object> }|null} */
let settingsCache = null;

/** Xoá cache cấu hình sự kiện — gọi sau khi admin PUT cấu hình, và trong test. */
export function clearEventSettingsCache() {
  settingsCache = null;
}

async function loadSettingsMap() {
  const now = Date.now();
  if (settingsCache && now - settingsCache.loadedAt < SETTINGS_CACHE_TTL_MS) {
    return settingsCache.byEvent;
  }
  const rows = await notificationEventSettingRepository.listAll();
  const byEvent = new Map(rows.map((row) => [row.eventType, row]));
  settingsCache = { loadedAt: now, byEvent };
  return byEvent;
}

/**
 * Cấu hình hiệu lực của một sự kiện. Đọc DB lỗi → dùng mặc định catalog (không cache lỗi, lần sau thử lại).
 *
 * @param {string} eventType
 * @returns {Promise<{ inAppEnabled: boolean, emailEnabled: boolean, userCanDisableEmail: boolean }|null>} null khi khoá không có trong catalog
 */
export async function getEffectiveEventSettings(eventType) {
  const defaults = getDefaultEventSettings(eventType);
  if (!defaults) return null;
  let byEvent;
  try {
    byEvent = await loadSettingsMap();
  } catch (error) {
    console.warn('[NotificationDispatch] không đọc được notification_event_settings, dùng mặc định catalog:', error?.message || error);
    return defaults;
  }
  const row = byEvent.get(eventType);
  if (!row) return defaults;
  return {
    inAppEnabled: row.inAppEnabled,
    emailEnabled: row.emailEnabled,
    userCanDisableEmail: row.userCanDisableEmail,
  };
}

/**
 * Bỏ những người đã TẮT email loại `eventType` (nếu loại này cho phép tắt). Dùng chung cho email sự kiện (notifyUsers) và đường
 * email cũ của bản tin admin (PR-3).
 *
 * @param {string} eventType
 * @param {Array<{ id: number }>} users
 * @param {{ userCanDisableEmail?: boolean }} [options] truyền sẵn khi đã đọc cấu hình (tránh đọc lần hai)
 * @returns {Promise<{ allowed: Array<{ id: number }>, skipped: Array<{ id: number }> }>}
 */
export async function filterEmailRecipientsByPreference(eventType, users, options = {}) {
  const list = Array.isArray(users) ? users : [];
  if (!list.length) return { allowed: [], skipped: [] };
  const userCanDisableEmail = typeof options.userCanDisableEmail === 'boolean'
    ? options.userCanDisableEmail
    : (await getEffectiveEventSettings(eventType))?.userCanDisableEmail === true;
  if (!userCanDisableEmail) return { allowed: list, skipped: [] };

  const disabled = await notificationPreferenceRepository.listEmailDisabledUserIds(
    eventType,
    list.map((user) => Number(user.id))
  );
  const allowed = [];
  const skipped = [];
  for (const user of list) {
    (disabled.has(Number(user.id)) ? skipped : allowed).push(user);
  }
  return { allowed, skipped };
}

function normalizeUserIds(userIds) {
  const set = new Set();
  for (const raw of Array.isArray(userIds) ? userIds : []) {
    const id = Number.parseInt(raw, 10);
    if (Number.isSafeInteger(id) && id > 0) set.add(id);
  }
  return [...set];
}

/** Chỉ nhận đường dẫn nội bộ (`/app/...`) hoặc URL http(s); thứ khác (javascript:, data:...) bỏ. */
function sanitizeLink(link) {
  const value = String(link ?? '').trim();
  if (!value) return null;
  if (!(value.startsWith('/') || /^https?:\/\//i.test(value))) return null;
  return value.slice(0, LINK_MAX);
}

function toAbsoluteUrl(link) {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const base = String(process.env.FRONTEND_URL || 'https://founderai.vn').replace(/\/$/, '');
  return `${base}${link}`;
}

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeChannels(channels) {
  if (!Array.isArray(channels)) return DEFAULT_CHANNELS;
  return channels.filter((channel) => channel === 'in_app' || channel === 'email');
}

function resolveEmailPayload(emailOption, recipient, fallback) {
  const custom = typeof emailOption === 'function' ? emailOption(recipient) : emailOption;
  if (custom?.subject && custom?.html) return { subject: custom.subject, html: custom.html };
  return buildNotificationEmail({
    fullName: recipient.fullName,
    title: fallback.title,
    message: fallback.message,
    actionUrl: toAbsoluteUrl(fallback.link),
  });
}

/**
 * Gửi email cho từng người, tối đa EMAIL_CONCURRENCY cùng lúc. Mỗi lỗi chỉ log.
 *
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendEmails(recipients, emailOption, fallback, eventType) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += EMAIL_CONCURRENCY) {
    const chunk = recipients.slice(i, i + EMAIL_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const settled = await Promise.allSettled(chunk.map(async (recipient) => {
      const { subject, html } = resolveEmailPayload(emailOption, recipient, fallback);
      await sendSystemEmail({ to: recipient.email, subject, html });
    }));
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        sent += 1;
      } else {
        failed += 1;
        console.warn(
          `[NotificationDispatch] gửi email lỗi event=${eventType} to=${chunk[index]?.email}:`,
          outcome.reason?.message || outcome.reason
        );
      }
    });
  }
  return { sent, failed };
}

/**
 * Lõi dùng chung của notifyUsers / notifyAdmins.
 *
 * @param {object} input
 * @param {(targetIds: number[], inserted: Set<number>|null, settings: object) => Promise<{ recipients: object[], skipped: number }>} resolveEmailRecipients
 */
async function deliver(input, resolveEmailRecipients) {
  const {
    eventType, userIds, title, titleEn = null, message, messageEn = null, link = null,
    severity = 'info', metadata = {}, notificationId = null, dedupeKey = null, email = null, channels = null,
  } = input;

  const result = { inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 };
  if (!getNotificationEvent(eventType)) {
    throw new Error(`notifyUsers: sự kiện không có trong catalog: ${eventType}`);
  }
  const ids = normalizeUserIds(userIds);
  const wanted = normalizeChannels(channels);
  const settings = await getEffectiveEventSettings(eventType);
  const safeLink = sanitizeLink(link);
  const safeTitle = clip(title, TITLE_MAX) || '';
  const safeDedupeKey = dedupeKey ? clip(dedupeKey, DEDUPE_KEY_MAX) : null;

  // null = không chèn được / không chèn → chưa biết ai đã có dòng (không lọc trùng cho email).
  let inserted = null;
  if (ids.length && wanted.includes('in_app') && settings.inAppEnabled) {
    try {
      const insertedIds = await userNotificationRepository.insertMany({
        userIds: ids,
        eventType,
        title: safeTitle,
        titleEn: clip(titleEn, TITLE_MAX),
        message: String(message ?? ''),
        messageEn: messageEn == null ? null : String(messageEn),
        link: safeLink,
        severity: SEVERITIES.has(severity) ? severity : 'info',
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        notificationId,
        dedupeKey: safeDedupeKey,
      });
      result.inApp = insertedIds.length;
      inserted = new Set(insertedIds);
    } catch (error) {
      console.error(`[NotificationDispatch] ghi in-app lỗi event=${eventType}:`, error?.message || error);
    }
  }

  if (wanted.includes('email') && settings.emailEnabled) {
    // Có dedupeKey + đã chèn được → chỉ người MỚI được chèn mới nhận email (gọi lại cùng sự kiện thì không gửi lần hai).
    const targetIds = safeDedupeKey && inserted ? ids.filter((id) => inserted.has(id)) : ids;
    result.emailSkipped += ids.length - targetIds.length;
    try {
      const { recipients, skipped } = await resolveEmailRecipients(targetIds, inserted, settings);
      result.emailSkipped += skipped;
      const outcome = await sendEmails(
        recipients,
        email,
        { title: safeTitle, message: String(message ?? ''), link: safeLink },
        eventType
      );
      result.emailSent += outcome.sent;
      result.emailFailed += outcome.failed;
    } catch (error) {
      result.emailFailed += targetIds.length;
      console.error(`[NotificationDispatch] chuẩn bị email lỗi event=${eventType}:`, error?.message || error);
    }
  }
  return result;
}

/**
 * Phát một thông báo tới danh sách người dùng.
 *
 * @param {object} input
 * @param {string} input.eventType khoá trong catalog
 * @param {Array<number|string>} input.userIds id NGƯỜI NHẬN thật (nhân viên có dòng users riêng, không theo chủ workspace)
 * @param {string} input.title
 * @param {string|null} [input.titleEn]
 * @param {string} input.message
 * @param {string|null} [input.messageEn]
 * @param {string|null} [input.link] đường dẫn nội bộ `/app/...` hoặc URL http(s)
 * @param {'info'|'success'|'warning'|'error'} [input.severity]
 * @param {object} [input.metadata]
 * @param {number|null} [input.notificationId] id bản tin admin (bảng notifications) nếu thông báo sinh từ bản tin
 * @param {string|null} [input.dedupeKey] chống trùng theo (user, key)
 * @param {{ subject: string, html: string }|((recipient: { id: number, email: string, fullName: string|null }) => { subject: string, html: string })|null} [input.email]
 *   mẫu email riêng (đối tượng dùng chung hoặc hàm theo người nhận); bỏ trống → buildNotificationEmail
 * @param {Array<'in_app'|'email'>|null} [input.channels] giới hạn kênh (mặc định cả hai); `['in_app']` tắt phần email của dispatcher
 * @returns {Promise<{ inApp: number, emailSent: number, emailSkipped: number, emailFailed: number }>}
 */
export async function notifyUsers(input) {
  return deliver(input, async (targetIds, _inserted, settings) => {
    const contacts = await userNotificationRepository.findEmailContacts(targetIds);
    const { allowed, skipped } = await filterEmailRecipientsByPreference(input.eventType, contacts, {
      userCanDisableEmail: settings.userCanDisableEmail,
    });
    return { recipients: allowed, skipped: targetIds.length - contacts.length + skipped.length };
  });
}

/**
 * Phát một thông báo tới MỌI super admin đang hoạt động. Chuông theo id admin; email theo `listAdminAlertEmails()` (env
 * `ADMIN_ALERT_EMAILS` có thể là địa chỉ không phải user) — KHÔNG qua `notification_preferences`.
 *
 * @param {Omit<Parameters<typeof notifyUsers>[0], 'userIds'>} input
 * @returns {Promise<{ inApp: number, emailSent: number, emailSkipped: number, emailFailed: number }>}
 */
export async function notifyAdmins(input) {
  const adminIds = await userNotificationRepository.listActiveAdminIds();
  return deliver({ ...input, userIds: adminIds }, async (targetIds, inserted) => {
    // Địa chỉ email admin không gắn với user cụ thể: sự kiện trùng (không dòng nào mới được chèn) thì không gửi lại.
    if (input.dedupeKey && inserted && inserted.size === 0 && adminIds.length > 0) {
      return { recipients: [], skipped: 0 };
    }
    // Nạp muộn: alert.repository kéo theo cả một chuỗi repository thanh toán/AI — dispatcher được import bởi engine chiến dịch và mọi
    // util thông báo, không nên mang chuỗi đó vào khi chỉ có sự kiện người dùng.
    const { listAdminAlertEmails } = await import('../../repositories/admin/alert.repository.js');
    const addresses = await listAdminAlertEmails();
    return {
      recipients: addresses.map((address) => ({ id: null, email: address, fullName: null })),
      skipped: 0,
    };
  });
}

export default { notifyUsers, notifyAdmins, filterEmailRecipientsByPreference, getEffectiveEventSettings, clearEventSettingsCache };
