/**
 * Option select form landing: `value` luôn là chuỗi tiếng Việt (đồng bộ DB `leads`).
 * `labelVi` / `labelEn` chỉ phục vụ hiển thị theo ngôn ngữ giao diện.
 */

/** @typedef {{ value: string, labelVi: string, labelEn: string }} UknowSelectOption */

/** @type {UknowSelectOption[]} */
export const UKNOW_OCCUPATION_OPTIONS = [
  { value: 'Sinh viên / Học sinh', labelVi: 'Sinh viên / Học sinh', labelEn: 'Student' },
  { value: 'Nhân viên văn phòng', labelVi: 'Nhân viên văn phòng', labelEn: 'Office worker' },
  { value: 'Giáo viên / Giảng viên', labelVi: 'Giáo viên / Giảng viên', labelEn: 'Teacher / Lecturer' },
  { value: 'Kinh doanh / Khởi nghiệp', labelVi: 'Kinh doanh / Khởi nghiệp', labelEn: 'Business / Startup' },
  { value: 'Marketing / Truyền thông', labelVi: 'Marketing / Truyền thông', labelEn: 'Marketing / Communications' },
  { value: 'Lập trình viên / IT', labelVi: 'Lập trình viên / IT', labelEn: 'Developer / IT' },
  { value: 'Freelancer', labelVi: 'Freelancer', labelEn: 'Freelancer' },
  { value: 'Khác', labelVi: 'Khác', labelEn: 'Other' },
];

/** @type {UknowSelectOption[]} */
export const UKNOW_INTEREST_OPTIONS = [
  {
    value: 'ChatGPT & Prompt Engineering',
    labelVi: 'ChatGPT & Prompt Engineering',
    labelEn: 'ChatGPT & prompt engineering',
  },
  {
    value: 'AI cho Marketing / Kinh doanh',
    labelVi: 'AI cho Marketing / Kinh doanh',
    labelEn: 'AI for marketing / business',
  },
  {
    value: 'AI cho Thiết kế & Sáng tạo',
    labelVi: 'AI cho Thiết kế & Sáng tạo',
    labelEn: 'AI for design & creativity',
  },
  {
    value: 'Lập trình với AI (No-code / Low-code)',
    labelVi: 'Lập trình với AI (No-code / Low-code)',
    labelEn: 'Building with AI (no-code / low-code)',
  },
  {
    value: 'AI cho Giáo dục',
    labelVi: 'AI cho Giáo dục',
    labelEn: 'AI for education',
  },
  {
    value: 'Tất cả các chủ đề AI',
    labelVi: 'Tất cả các chủ đề AI',
    labelEn: 'All AI topics',
  },
];

/**
 * Lấy nhãn hiển thị cho một option theo locale.
 *
 * @param {UknowSelectOption} opt
 * @param {'vi' | 'en'} locale
 * @returns {string}
 */
export function getOptionLabel(opt, locale) {
  return locale === 'en' ? opt.labelEn : opt.labelVi;
}
