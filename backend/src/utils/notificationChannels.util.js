/**
 * Kênh gửi của bản tin admin (bảng `notifications`, cột `channels` — migration 290).
 * PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 5 (PR-3). Thuần dữ liệu/hàm, không chạm DB/HTTP.
 *
 *  - `email`  : đường email cũ của "Trung tâm Chiến dịch Email" (có log từng người nhận + thống kê riêng).
 *  - `in_app` : chuông thông báo (bảng `user_notifications`, qua dispatcher `notifyUsers`).
 */

export const NOTIFICATION_CHANNELS = Object.freeze(['email', 'in_app']);

/** Bản tin tạo trước PR-3 (hoặc API cũ không gửi `channels`) chỉ có email — đúng DEFAULT của cột. */
export const DEFAULT_NOTIFICATION_CHANNELS = Object.freeze(['email']);

/** Loại bản tin mà người dùng KHÔNG tắt được email (cùng `priority='urgent'`). */
const EMAIL_LOCKED_TYPES = new Set(['security', 'maintenance']);

/**
 * Kiểm `channels` từ body request.
 *
 * @param {unknown} value
 * @returns {{ ok: true, channels: string[] } | { ok: false, message: string }}
 *   `channels` đã bỏ trùng, theo thứ tự chuẩn (email trước, in_app sau).
 */
export function parseNotificationChannels(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, message: 'Vui lòng chọn ít nhất một kênh gửi (email hoặc in_app)' };
  }
  const requested = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || !NOTIFICATION_CHANNELS.includes(item)) {
      return { ok: false, message: `Kênh gửi không hợp lệ: ${String(item)}. Chỉ nhận ${NOTIFICATION_CHANNELS.join(', ')}` };
    }
    requested.add(item);
  }
  return { ok: true, channels: NOTIFICATION_CHANNELS.filter((channel) => requested.has(channel)) };
}

/**
 * Kênh đã lưu của một bản tin → mảng dùng được. Thiếu/hỏng/rỗng → mặc định ['email'] (không bao giờ im lặng không gửi gì).
 *
 * @param {unknown} stored
 * @returns {string[]}
 */
export function normalizeStoredChannels(stored) {
  const parsed = parseNotificationChannels(stored);
  return parsed.ok ? parsed.channels : [...DEFAULT_NOTIFICATION_CHANNELS];
}

/**
 * Email của bản tin này có "khoá" không — khoá thì bỏ qua tuỳ chọn tắt email của người dùng
 * (khẩn cấp / bảo trì / bảo mật là thông tin người dùng buộc phải nhận).
 *
 * @param {{ priority?: string|null, type?: string|null }} notification
 * @returns {boolean}
 */
export function isBroadcastEmailLocked(notification) {
  return notification?.priority === 'urgent' || EMAIL_LOCKED_TYPES.has(String(notification?.type || ''));
}

/** `priority` của bản tin → mức độ hiển thị của dòng chuông. */
export function broadcastSeverity(priority) {
  if (priority === 'urgent') return 'error';
  if (priority === 'high') return 'warning';
  return 'info';
}

/**
 * Câu tổng kết sau khi gửi (toast của admin) + cờ thành công.
 * Thất bại toàn bộ email (đã thử gửi mà không thư nào đi) là `success:false` kể cả khi chuông đã chèn được — admin phải thấy.
 * Chuông lỗi (`inAppFailed`: notifyUsers ném, hoặc không chèn được dòng nào trong khi có người nhận) cũng là `success:false`
 * với câu "Chuông: lỗi ..." — bản tin vẫn ở trạng thái đã gửi nên admin chỉ có câu này để biết chuông không tới.
 *
 * @param {{ sent?: number, failed?: number, total?: number, emailTotal?: number, emailSkipped?: number, inApp?: number, inAppFailed?: boolean, channels?: string[] }} result kết quả của `sendNow`
 * @returns {{ success: boolean, message: string }}
 */
export function summarizeSendResult(result) {
  const channels = Array.isArray(result?.channels) && result.channels.length ? result.channels : [...DEFAULT_NOTIFICATION_CHANNELS];
  const sent = Number(result?.sent) || 0;
  const failed = Number(result?.failed) || 0;
  const total = Number(result?.total) || 0;
  const emailTotal = result?.emailTotal === undefined ? total : (Number(result.emailTotal) || 0);
  const emailSkipped = Number(result?.emailSkipped) || 0;
  const inApp = Number(result?.inApp) || 0;

  const parts = [];
  let success = true;

  if (channels.includes('email')) {
    if (emailTotal === 0 && total > 0) {
      parts.push('Không gửi email nào');
    } else if (sent === 0 && emailTotal > 0) {
      success = false;
      parts.push(`Gửi thất bại toàn bộ ${emailTotal} email`);
    } else if (failed === 0) {
      parts.push(`Đã gửi thành công ${sent}/${emailTotal} email`);
    } else {
      parts.push(`Đã gửi ${sent}/${emailTotal} email, ${failed} thất bại`);
    }
    if (emailSkipped > 0) parts.push(`${emailSkipped} người đã tắt nhận email loại này`);
  }
  if (channels.includes('in_app')) {
    if (result?.inAppFailed === true) {
      success = false;
      parts.push('Chuông: lỗi, không chèn được thông báo nào');
    } else {
      parts.push(`Đã gửi ${inApp} thông báo chuông`);
    }
  }
  return { success, message: parts.join('. ') };
}
