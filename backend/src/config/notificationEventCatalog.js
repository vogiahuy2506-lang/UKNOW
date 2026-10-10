/**
 * Danh mục sự kiện thông báo (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 2.1) — thuần dữ liệu, không import gì.
 *
 * Mỗi mục: { key, label, labelEn, description, audience: 'user'|'admin', defaults: { inApp, email }, userCanDisableEmail }.
 *  - `defaults`: bật/tắt chuông (in-app) và email khi super admin CHƯA cấu hình (thiếu dòng trong `notification_event_settings`).
 *    MẶC ĐỊNH CHỈ CHUÔNG, KHÔNG EMAIL (user chốt 10/10/2026): email do super admin bật theo từng sự kiện ở tab "Cấu hình kênh".
 *    Migration 289 seed giá trị cũ; migration 293 đưa email về false — có spec ghim, đổi ở đây phải đổi cả migration mới.
 *  - `userCanDisableEmail`: người dùng có tự tắt được email loại này không (chuông thì luôn bật phía người dùng).
 *    false cho loại bảo mật / thanh toán / nhân-viên-chờ-duyệt.
 *  - `audience: 'admin'`: sự kiện gửi cho super admin (không hiện ở trang tuỳ chọn của người dùng, không qua `notification_preferences`).
 *
 * Chưa đưa vào đợt này (giữ email như cũ): hết hạn mức (quotaPaused/Stopped), khách để lại liên hệ trong chat (đã có công tắc riêng),
 * kênh mất kết nối, gói sắp hết hạn, AI không sẵn sàng.
 */
export const NOTIFICATION_EVENTS = Object.freeze([
  {
    key: 'admin_broadcast',
    label: 'Thông báo từ quản trị viên',
    labelEn: 'Announcements from administrators',
    description: 'Bản tin, thông báo bảo trì, khuyến mãi do quản trị viên Founder AI gửi.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'campaign_run_completed',
    label: 'Chiến dịch chạy xong',
    labelEn: 'Campaign run completed',
    description: 'Báo khi một lượt chạy chiến dịch hoàn tất, kèm số tin đã gửi và số lỗi.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'campaign_run_failed',
    label: 'Chiến dịch gặp lỗi',
    labelEn: 'Campaign run failed',
    description: 'Báo khi một lượt chạy chiến dịch hỏng hoặc bị hệ thống tự dừng, kèm lý do và cách xử lý.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'campaign_approval_required',
    label: 'Chiến dịch chờ bạn duyệt',
    labelEn: 'Campaign awaiting your approval',
    description: 'Báo chủ tài khoản khi chiến dịch của nhân viên vượt ngưỡng người nhận và cần được duyệt.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: false,
  },
  {
    key: 'campaign_schedule_skipped',
    label: 'Lịch chiến dịch bị bỏ qua',
    labelEn: 'Campaign schedule skipped',
    description: 'Báo khi lịch đến giờ chạy nhưng lượt chạy trước của chiến dịch chưa xong nên lượt này bị bỏ qua.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'support_ticket_replied',
    label: 'Phản hồi cho góp ý của bạn',
    labelEn: 'Reply to your feedback',
    description: 'Báo khi quản trị viên trả lời một góp ý / yêu cầu hỗ trợ bạn đã gửi.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: false,
  },
  {
    key: 'support_ticket_closed',
    label: 'Góp ý của bạn đã được đóng',
    labelEn: 'Your feedback was closed',
    description: 'Báo khi một góp ý / yêu cầu hỗ trợ được đóng (thủ công hoặc tự động sau thời gian không phản hồi).',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'support_ticket_created',
    label: 'Có góp ý mới',
    labelEn: 'New feedback ticket',
    description: 'Báo mọi quản trị viên khi có người dùng gửi góp ý / yêu cầu hỗ trợ mới.',
    audience: 'admin',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: false,
  },
  {
    key: 'support_ticket_user_replied',
    label: 'Người dùng trả lời góp ý',
    labelEn: 'User replied to a ticket',
    description: 'Báo mọi quản trị viên khi người dùng trả lời thêm trong một góp ý / yêu cầu hỗ trợ.',
    audience: 'admin',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: false,
  },
]);

export const NOTIFICATION_EVENT_KEYS = Object.freeze(NOTIFICATION_EVENTS.map((event) => event.key));

const EVENT_BY_KEY = new Map(NOTIFICATION_EVENTS.map((event) => [event.key, event]));

/**
 * @param {unknown} key
 * @returns {boolean}
 */
export function isKnownNotificationEvent(key) {
  return EVENT_BY_KEY.has(String(key));
}

/**
 * @param {unknown} key
 * @returns {typeof NOTIFICATION_EVENTS[number]|null}
 */
export function getNotificationEvent(key) {
  return EVENT_BY_KEY.get(String(key)) || null;
}

/**
 * Cấu hình hiệu lực khi KHÔNG có dòng trong `notification_event_settings`.
 *
 * @param {string} key
 * @returns {{ inAppEnabled: boolean, emailEnabled: boolean, userCanDisableEmail: boolean }|null}
 */
export function getDefaultEventSettings(key) {
  const event = getNotificationEvent(key);
  if (!event) return null;
  return {
    inAppEnabled: event.defaults.inApp,
    emailEnabled: event.defaults.email,
    userCanDisableEmail: event.userCanDisableEmail,
  };
}
