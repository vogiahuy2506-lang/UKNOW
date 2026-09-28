// Gói giữ chỗ "Tùy chọn"/"Liên hệ" (code custom/contact, is_custom=false) — mirror của
// backend/src/utils/placeholderPlan.util.js. Gói custom THẬT (is_custom=true) không bao giờ là giữ chỗ
// dù trùng code, vì admin có thể đặt code tuỳ ý khi tạo gói riêng cho khách.
const PLACEHOLDER_PLAN_CODES = new Set(['custom', 'contact']);

export const isPlaceholderPlan = ({ code, isCustom } = {}) =>
  PLACEHOLDER_PLAN_CODES.has(String(code || '').trim().toLowerCase()) && isCustom !== true;
