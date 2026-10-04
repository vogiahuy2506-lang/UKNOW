/**
 * UI glossary for help article translation (VN → EN).
 * Labels must match frontend/src/i18n en.js / vi.js nav.* exactly.
 */
export const HELP_UI_GLOSSARY = [
  ['Gửi nhanh', 'Quick Send'],
  ['Tạo chiến dịch mới', 'Create Campaign'],
  ['Tạo chiến dịch', 'Create Campaign'],
  ['Hồ sơ doanh nghiệp', 'Business Profile'],
  ['Gói & Thanh toán', 'Plan & Billing'],
  ['Quản lý kênh gửi', 'Channel Management'],
  ['Chạy chiến dịch', 'Run Campaign'],
  ['Giám sát gửi tin', 'Delivery monitor'],
  ['Quản lý chiến dịch', 'Campaign Management'],
  ['Thư viện nội dung', 'Content library'],
  ['Mẫu tin nhắn', 'Message Templates'],
  ['Landing Pages', 'Landing Pages'],
  ['Tạo Landing page', 'Create Landing page'],
  ['Khách hàng từ chiến dịch', 'Customers from campaigns'],
  ['Trợ lý AI', 'AI Assistant'],
  ['Chatbot của tôi', 'My Chatbots'],
  // Cột "Triển khai" của Studio (04/10/2026) — khớp `chatbot.studio.*` trong frontend/src/i18n/en.js.
  ['Đưa chatbot tới khách', 'Reach your customers'],
  ['Trên website', 'On your website'],
  ['Nút chat nổi', 'Floating chat button'],
  ['Khung chat trong trang', 'Chat frame in page'],
  ['Link chat riêng', 'Dedicated chat link'],
  ['Trên ứng dụng nhắn tin', 'On messaging apps'],
  ['Sao chép & bán', 'Copy & sell'],
  ['Gửi bản sao', 'Send a copy'],
  ['Đăng bán trên Marketplace', 'Sell on Marketplace'],
  ['Cuộc trò chuyện mới', 'New conversation'],
  ['Hộp thư', 'Inbox'],
  ['Tệp & dung lượng', 'Files & storage'],
  ['Tổng quan', 'Dashboard'],
  ['Báo cáo', 'Reports'],
  ['Cài đặt', 'Settings'],
];

export function glossaryPromptBlock() {
  return HELP_UI_GLOSSARY
    .map(([vi, en]) => `- "${vi}" → "${en}"`)
    .join('\n');
}
