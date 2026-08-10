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
  ['Hiệu quả chiến dịch', 'Campaign performance'],
  ['Quản lý chiến dịch', 'Campaign Management'],
  ['Thư viện nội dung', 'Content library'],
  ['Mẫu tin nhắn', 'Message Templates'],
  ['Landing Pages', 'Landing Pages'],
  ['Tạo Landing page', 'Create Landing page'],
  ['Khách hàng từ chiến dịch', 'Customers from campaigns'],
  ['Trợ lý AI', 'AI Assistant'],
  ['Tạo AI Chatbot', 'Create AI Chatbot'],
  ['Lịch sử trò chuyện', 'Conversation History'],
  ['Thư viện media', 'Media library'],
  ['Tổng quan', 'Dashboard'],
  ['Báo cáo', 'Reports'],
  ['Cài đặt', 'Settings'],
];

export function glossaryPromptBlock() {
  return HELP_UI_GLOSSARY
    .map(([vi, en]) => `- "${vi}" → "${en}"`)
    .join('\n');
}
