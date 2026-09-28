// Thẻ "Gói Tùy chọn"/"Liên hệ" trên bảng giá là gói giữ chỗ: giá 0 và mọi hạn mức NULL — NULL nghĩa là
// KHÔNG giới hạn ở mọi chốt chặn. Frontend coi hai mã này là gói liên hệ (planTranslation.util.js
// `isContactPlan`) nên không bao giờ gọi activate-free/tạo thanh toán cho chúng; các đường phía backend
// (activate-free, admin gán gói) phải chặn cùng luật.
//
// is_custom = false là điều kiện bắt buộc: gói custom THẬT của khách (is_custom = true) được admin đặt
// code tuỳ ý khi tạo, kể cả trùng 'custom' — check chỉ theo code sẽ chặn nhầm việc kích hoạt gói custom
// thật (xem AdminPlansPage.jsx nút "Kích hoạt" → assignPlan → findPlanById không lọc is_custom).
const PLACEHOLDER_PLAN_CODES = new Set(['custom', 'contact']);

const isPlaceholderPlan = (plan) =>
  PLACEHOLDER_PLAN_CODES.has(String(plan?.code || '').trim().toLowerCase()) && plan?.is_custom !== true;

export { PLACEHOLDER_PLAN_CODES, isPlaceholderPlan };
