import { isDisplayFieldType, RATING_MAX } from './formFieldTypes.util';

/**
 * Chữ HIỂN THỊ của một câu trả lời trong màn bài nộp (`FormSubmissionsPage`) và modal chi tiết khách
 * (`FormLeadDetailModal`) — PR-4, PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11.
 *
 * Backend lưu mỗi câu trả lời dạng ảnh chụp `{ label, type, value }` (xem formSubmission.util.js). Giá trị thô:
 *  - rating  → số nguyên 1..5, hiện "4/5 ★";
 *  - yes_no  → "yes" | "no", hiện Có / Không (theo ngôn ngữ giao diện, qua `t`);
 *  - time    → "HH:MM", hiện nguyên văn;
 *  - checkbox → mảng, nối bằng ", ";
 *  - còn lại  → chuỗi/số như cũ.
 *
 * @param {string|undefined} type loại trường lúc nộp (từ ảnh chụp); không rõ thì hiện nguyên giá trị
 * @param {unknown} value giá trị thô
 * @param {(key: string) => string} [t] hàm dịch — thiếu thì yes_no hiện nguyên "yes"/"no"
 * @returns {string}
 */
export function formatAnswerForDisplay(type, value, t) {
  if (Array.isArray(value)) return value.map((v) => String(v ?? '')).filter(Boolean).join(', ');
  if (value === null || value === undefined) return '';
  if (type === 'rating') {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= RATING_MAX) return `${n}/${RATING_MAX} ★`;
  }
  if (type === 'yes_no' && typeof t === 'function') {
    if (value === 'yes') return t('forms.answerValue.yes');
    if (value === 'no') return t('forms.answerValue.no');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Một mục trong ảnh chụp câu trả lời có phải của khối hiển thị không (tiêu đề / đoạn chữ / ngắt trang)? Backend không
 * bao giờ ghi những mục này; kiểm ở đây để dữ liệu bẩn/ngoại lai cũng không hiện thành một dòng "nhãn: —".
 *
 * @param {unknown} item giá trị của một khoá trong `answers`
 * @returns {boolean}
 */
export function isDisplayBlockAnswer(item) {
  return item !== null && typeof item === 'object' && !Array.isArray(item) && isDisplayFieldType(item.type);
}
