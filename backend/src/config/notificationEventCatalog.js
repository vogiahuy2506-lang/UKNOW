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
 * PR-6 (10/10/2026): 6 khoá cuối (hết hạn mức, khách để lại liên hệ, kênh mất kết nối, gói sắp hết hạn / đã hết hạn, AI không sẵn sàng)
 * là 5 loại email cũ đưa vào chuông. Migration 294 seed 6 dòng — thêm khoá vào catalog mà quên migration thì spec catalog đỏ.
 * PR-4b biểu mẫu (12/10/2026): khoá `form_file_quota_exceeded` (khách tải tệp nhưng chủ hết dung lượng) — migration 300 seed dòng của nó.
 * PR-8c biểu mẫu (12/10/2026): khoá `form_submission_received` (có bài nộp mới, gộp theo biểu mẫu/10 phút) — migration 302 seed dòng của nó.
 * PR-3 gửi chậm (19/10/2026): khoá `campaign_sending_slow` (Zalo giới hạn tra số / cấm nhắn người lạ làm chiến dịch gửi rất chậm) — migration 307 seed dòng của nó.
 * NGOẠI LỆ "chỉ chuông": `plan_expiring` / `plan_expired` MẶC ĐỊNH BẬT EMAIL (quyết định 10/10): khách không đăng nhập thì không thấy chuông,
 * mất nhắc gia hạn là mất doanh thu; super admin vẫn tắt được ở tab "Cấu hình kênh".
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
  {
    key: 'campaign_quota_exhausted',
    label: 'Chiến dịch dừng vì hết hạn mức gửi',
    labelEn: 'Campaign paused: sending quota reached',
    description: 'Báo khi chiến dịch tạm dừng hoặc bị dừng vì chạm hạn mức gửi của gói (hoặc giới hạn ngày bạn tự đặt cho tài khoản gửi).',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'chatbot_contact_left',
    label: 'Khách để lại liên hệ trong chatbot',
    labelEn: 'Customer left contact info in chatbot',
    description: 'Báo khi khách để lại số điện thoại hoặc email trong hội thoại với chatbot. Công tắc email riêng trong cài đặt Hộp thư vẫn có hiệu lực.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'channel_disconnected',
    label: 'Kênh mất kết nối',
    labelEn: 'Channel disconnected',
    description: 'Báo khi tài khoản Zalo cá nhân, Telegram hoặc WhatsApp của bạn mất kết nối quá 15 phút và cần quét lại.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    key: 'plan_expiring',
    label: 'Gói sắp hết hạn',
    labelEn: 'Plan expiring soon',
    description: 'Nhắc gia hạn trước khi gói dịch vụ hết hạn (theo các mốc ngày quản trị viên cấu hình).',
    audience: 'user',
    defaults: { inApp: true, email: true },
    userCanDisableEmail: false,
  },
  {
    key: 'plan_expired',
    label: 'Gói đã hết hạn',
    labelEn: 'Plan expired',
    description: 'Báo khi gói dịch vụ đã hết hạn và quyền lợi của gói bị thu hồi.',
    audience: 'user',
    defaults: { inApp: true, email: true },
    userCanDisableEmail: false,
  },
  {
    key: 'ai_unavailable',
    label: 'Chatbot không trả lời được khách',
    labelEn: 'Chatbot unable to reply to customers',
    description: 'Báo khi chatbot không trả lời được khách vì hết lượt AI, hết hạn gói hoặc chạm hạn mức AI. Nhắc tối đa một lần mỗi 24 giờ.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    // Quyết định 12/10: kéo khách ngoài app quay lại thanh toán nên MẶC ĐỊNH BẬT EMAIL (ngoại lệ "chỉ chuông" như plan_expiring), nhưng khác
    // plan_expiring ở chỗ khách TỰ TẮT được email — đây là thư chào hàng lại, không phải thông báo bắt buộc về gói đang dùng.
    key: 'order_payment_reminder',
    label: 'Nhắc thanh toán lại đơn gói chưa hoàn tất',
    labelEn: 'Reminder to complete an unpaid plan order',
    description: 'Nhắc một lần, khoảng 2 giờ sau khi bạn chọn gói nhưng chưa thanh toán xong (link thanh toán hết hạn hoặc bạn đã huỷ), kèm đường dẫn để thanh toán lại.',
    audience: 'user',
    defaults: { inApp: true, email: true },
    userCanDisableEmail: true,
  },
  {
    key: 'form_file_quota_exceeded',
    label: 'Biểu mẫu chưa nhận được tệp vì hết dung lượng',
    labelEn: 'Form could not receive a file: storage full',
    description: 'Báo khi khách đính kèm tệp vào biểu mẫu nhưng tài khoản đã hết dung lượng lưu trữ nên tệp chưa được lưu (các ô khác của khách vẫn được ghi nhận). Nhắc tối đa một lần mỗi giờ cho mỗi biểu mẫu.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    // PR-8c biểu mẫu (12/10/2026), migration 302. Mặc định CHỈ chuông: thư báo của từng biểu mẫu ("Báo cho tôi qua email" — settings.notifyOwner)
    // đã có riêng và chạy độc lập, bật thêm email ở đây sẽ báo hai lần.
    key: 'form_submission_received',
    label: 'Có bài nộp mới ở biểu mẫu',
    labelEn: 'New form submission',
    description: 'Báo khi có khách nộp biểu mẫu của bạn, bấm vào để mở thẳng trang bài nộp của biểu mẫu đó. Gộp để khỏi dồn thông báo: mỗi biểu mẫu tối đa một thông báo trong 10 phút, nêu người nộp đầu tiên của khoảng đó.',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
  },
  {
    // PLAN_THAM_CHIEU_KHOI_VA_RUN_BO_CHAM PR-3 (19/10/2026), migration 307. Mặc định CHỈ chuông (mặc định chung).
    key: 'campaign_sending_slow',
    label: 'Chiến dịch gửi chậm bất thường',
    labelEn: 'Campaign sending unusually slowly',
    description: 'Báo khi chiến dịch nhiều ngày liền chỉ gửi được rất ít vì Zalo giới hạn tài khoản gửi (tra số điện thoại, nhắn người lạ).',
    audience: 'user',
    defaults: { inApp: true, email: false },
    userCanDisableEmail: true,
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
