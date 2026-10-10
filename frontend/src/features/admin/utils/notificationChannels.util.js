/**
 * Kênh gửi của bản tin admin (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 5). Thuần hàm, đồng bộ với
 * backend `utils/notificationChannels.util.js`.
 */

/** Thứ tự chuẩn của mảng `channels` (đúng dạng backend nhận/lưu). */
export const NOTIFICATION_CHANNEL_ORDER = ['email', 'in_app'];

/** Loại bản tin mà email luôn được gửi (người dùng không tắt được) — cùng `priority='urgent'`. */
const EMAIL_LOCKED_TYPES = new Set(['security', 'maintenance']);

/**
 * @param {string|null|undefined} type
 * @param {string|null|undefined} priority
 * @returns {boolean} email của bản tin này có bị khoá (bỏ qua tuỳ chọn tắt email của người dùng) không
 */
export function isEmailLockedBroadcast(type, priority) {
  return EMAIL_LOCKED_TYPES.has(String(type || '')) || priority === 'urgent';
}

/** Liên kết chuông: để trống, đường dẫn nội bộ `/...` hoặc URL http(s) — đồng bộ `sanitizeLink` của dispatcher. */
export function isValidBroadcastLink(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return text.startsWith('/') || /^https?:\/\//i.test(text);
}

/**
 * Kênh đang BẬT trong cấu hình sự kiện `admin_broadcast` (tab "Cấu hình kênh"). Backend trả 400 nếu bản tin chọn kênh đang tắt,
 * nên đây vừa là mặc định vừa là tập kênh được phép chọn. Không đọc được cấu hình → cả hai (backend vẫn là chốt chặn).
 *
 * @param {{ inAppEnabled?: boolean, emailEnabled?: boolean }|null|undefined} settings
 * @returns {string[]}
 */
export function defaultChannelsFromSettings(settings) {
  if (!settings) return [...NOTIFICATION_CHANNEL_ORDER];
  return NOTIFICATION_CHANNEL_ORDER.filter((channel) => (
    channel === 'email' ? settings.emailEnabled === true : settings.inAppEnabled === true
  ));
}

/** Kênh đang TẮT trong cấu hình (phần bù của defaultChannelsFromSettings). */
export function disabledChannelsFromSettings(settings) {
  const enabled = defaultChannelsFromSettings(settings);
  return NOTIFICATION_CHANNEL_ORDER.filter((channel) => !enabled.includes(channel));
}

/** Mảng `channels` từ dòng lịch sử; bản tin cũ thiếu cột → ['email']. */
export function channelsOfNotification(notification) {
  const list = Array.isArray(notification?.channels) ? notification.channels : [];
  const known = NOTIFICATION_CHANNEL_ORDER.filter((channel) => list.includes(channel));
  return known.length ? known : ['email'];
}
