/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: câu lệnh dựng sẵn gửi cho đường
 * sửa AI (editLandingHtmlWithAi, rule 2b — việc 2) khi bấm "Nhờ AI thêm ô này" trong
 * LeadFormConfigPanel. Tách khỏi component để không kích react-refresh/only-export-components
 * (file component chỉ nên export component).
 */

const CUSTOM_FIELD_TYPE_DESCRIPTIONS = {
  text: 'kiểu chữ ngắn (input text)',
  textarea: 'kiểu đoạn văn dài (textarea)',
  select: 'kiểu danh sách chọn (select)',
  radio: 'kiểu chọn một trong nhiều (radio)',
  checkbox: 'kiểu hộp kiểm (checkbox)',
};

/**
 * @param {{ key: string, type: string, labelVi?: string, required?: boolean, options?: Array<{ value: string, labelVi?: string }> }} field
 * @returns {string}
 */
export function buildAddCustomFieldInstruction(field) {
  const label = field.labelVi || field.key;
  const typeDesc = CUSTOM_FIELD_TYPE_DESCRIPTIONS[field.type] || CUSTOM_FIELD_TYPE_DESCRIPTIONS.text;
  const optionsPart =
    (field.type === 'select' || field.type === 'radio') && Array.isArray(field.options) && field.options.length
      ? ` với các lựa chọn: ${field.options.map((o) => o.labelVi || o.value).join(', ')}`
      : '';
  const requiredPart = field.required ? ', bắt buộc điền' : '';
  return `Thêm vào form đăng ký hiện có (giữ nguyên mọi trường khác) một ô ${typeDesc}, name="${field.key}", nhãn "${label}"${optionsPart}${requiredPart}.`;
}

/**
 * @param {'occupation'|'interestArea'} key
 * @returns {string}
 */
export function buildAddFixedFieldInstruction(key) {
  const label = key === 'occupation' ? 'Nghề nghiệp' : 'Lĩnh vực quan tâm';
  return `Thêm vào form đăng ký hiện có (giữ nguyên mọi trường khác) một select name="${key}", nhãn "${label}", bắt buộc chọn.`;
}
