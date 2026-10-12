/**
 * Phân loại các loại "trường" của biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-4).
 *
 * Mảng `fields` của biểu mẫu chứa hai nhóm:
 *  - trường NHẬP (khách điền): short_text, long_text, email, phone, number, select, radio, checkbox, date,
 *    rating, yes_no, time — có giá trị, có thể `required`, có thể có `role`;
 *  - khối HIỂN THỊ (chỉ để dàn trang): heading, paragraph, page_break — KHÔNG có giá trị, KHÔNG `required`,
 *    KHÔNG `role`, KHÔNG `options`; mọi nơi duyệt `fields` để thu/đọc câu trả lời phải bỏ qua chúng.
 *
 * File này không import gì (để formDefinition / formSubmission / formCampaignItem cùng dùng mà không tạo vòng
 * import — formDefinition đã import formCampaignItem).
 */

export const DISPLAY_FIELD_TYPES = Object.freeze(['heading', 'paragraph', 'page_break']);

/**
 * Loại trường AI ĐƯỢC sinh / được nhận từ nháp AI (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-5 + PR-7a). Liệt kê TƯỜNG MINH
 * (không suy từ ALLOWED_FIELD_TYPES) để một loại mới thêm về sau — kể cả `file` của PR-4b — không tự lọt vào đầu ra AI, và không lọt
 * qua nháp biểu mẫu do trình duyệt gửi kèm lúc lưu landing (`landingFormDrafts.util.js`) mà chưa ai dạy prompt về nó.
 */
export const AI_FORM_FIELD_TYPES = Object.freeze([
  'short_text', 'long_text', 'email', 'phone', 'number', 'select', 'radio', 'checkbox', 'date', 'rating', 'yes_no', 'time',
  'heading', 'paragraph', 'page_break',
]);

/** Giá trị hợp lệ của loại `rating` (số nguyên 1..RATING_MAX sao). Cố định 5 sao — chưa cho tuỳ `max`. */
export const RATING_MAX = 5;

/** Giá trị hợp lệ của loại `yes_no`. */
export const YES_NO_VALUES = Object.freeze(['yes', 'no']);

/**
 * @param {unknown} type
 * @returns {boolean} true nếu là khối hiển thị (heading / paragraph / page_break)
 */
export function isDisplayFieldType(type) {
  return DISPLAY_FIELD_TYPES.includes(String(type || '').trim().toLowerCase());
}
