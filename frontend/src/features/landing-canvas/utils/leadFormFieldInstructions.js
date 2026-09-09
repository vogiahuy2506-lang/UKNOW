/**
 * PLAN_LEAD_FORM_TRUONG_THEM_2026-09-08.md PR-2d-3 việc 3: câu lệnh dựng sẵn gửi cho đường
 * sửa AI (editLandingHtmlWithAi, rule 2b — việc 2) khi bấm "Nhờ AI thêm ô này" trong
 * LeadFormConfigPanel. Tách khỏi component để không kích react-refresh/only-export-components
 * (file component chỉ nên export component).
 *
 * Sửa 09/09 sau sự cố slug-test: bản trước chỉ liệt kê NHÃN lựa chọn ("với các lựa chọn: Lựa
 * chọn 1, ...") nên AI ghi `<option value="Lựa chọn 1">` — backend đối chiếu mã `opt_a` nên từ
 * chối mọi lead. Đường sinh trang mới (aiLandingPage.service.js buildLeadFormExtraFieldsPromptBlock)
 * đã chèn sẵn markup `<option value="opt_a">` nên không lỗi; đường sửa phải làm y hệt: đưa
 * đúng khối markup, dặn COPY Y NGUYÊN value, và dặn THAY ô cũ nếu trang đã có (để sửa được
 * trang đã sinh sai, không tạo ô thứ 2).
 */

import {
  founder_OCCUPATION_OPTIONS,
  founder_INTEREST_OPTIONS,
} from '../../landing/constants/founder-landing-options.js';

const CUSTOM_FIELD_TYPE_DESCRIPTIONS = {
  text: 'kiểu chữ ngắn (input text)',
  textarea: 'kiểu đoạn văn dài (textarea)',
  select: 'kiểu danh sách chọn (select)',
  radio: 'kiểu chọn một trong nhiều (radio)',
  checkbox: 'kiểu hộp kiểm (checkbox)',
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function selectMarkup(name, placeholder, options, required) {
  const requiredAttr = required ? ' required' : '';
  return [
    `<select name="${name}"${requiredAttr}>`,
    `  <option value="">${escapeHtml(placeholder)}</option>`,
    ...options.map((o) => `  <option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`),
    '</select>',
  ].join('\n');
}

function radioMarkup(name, options, required) {
  const requiredAttr = required ? ' required' : '';
  return options
    .map((o) => `<label><input type="radio" name="${name}" value="${escapeHtml(o.value)}"${requiredAttr} /> ${escapeHtml(o.label)}</label>`)
    .join('\n');
}

function optionRule(name, markup) {
  return (
    ` Dùng ĐÚNG khối HTML sau cho ô này, COPY Y NGUYÊN từng value — không dịch, không viết lại,` +
    ` không đổi mã, không thêm/bớt lựa chọn (backend chỉ nhận đúng các mã này, sai mã thì mọi` +
    ` lượt đăng ký của khách bị từ chối). Nếu form ĐÃ có ô name="${name}" thì THAY ô đó bằng` +
    ` khối này (mọi chỗ xuất hiện), không tạo ô thứ 2:\n${markup}`
  );
}

/**
 * @param {{ key: string, type: string, labelVi?: string, required?: boolean, options?: Array<{ value: string, labelVi?: string }> }} field
 * @returns {string}
 */
export function buildAddCustomFieldInstruction(field) {
  const label = field.labelVi || field.key;
  const typeDesc = CUSTOM_FIELD_TYPE_DESCRIPTIONS[field.type] || CUSTOM_FIELD_TYPE_DESCRIPTIONS.text;
  const requiredPart = field.required ? ', bắt buộc điền' : '';
  const base = `Thêm vào form đăng ký hiện có (giữ nguyên mọi trường khác) một ô ${typeDesc}, name="${field.key}", nhãn "${label}"${requiredPart}.`;

  const options = (Array.isArray(field.options) ? field.options : [])
    .map((o) => ({ value: String(o?.value ?? '').trim(), label: String(o?.labelVi || o?.value || '').trim() }))
    .filter((o) => o.value);
  if ((field.type === 'select' || field.type === 'radio') && options.length) {
    const markup =
      field.type === 'radio'
        ? radioMarkup(field.key, options, field.required)
        : selectMarkup(field.key, label, options, field.required);
    return base + optionRule(field.key, markup);
  }
  return base;
}

/**
 * @param {'occupation'|'interestArea'} key
 * @returns {string}
 */
export function buildAddFixedFieldInstruction(key) {
  const isOccupation = key === 'occupation';
  const label = isOccupation ? 'Nghề nghiệp' : 'Lĩnh vực quan tâm';
  const placeholder = isOccupation ? 'Chọn nghề nghiệp' : 'Chọn chủ đề quan tâm';
  const options = (isOccupation ? founder_OCCUPATION_OPTIONS : founder_INTEREST_OPTIONS).map((o) => ({
    value: o.value,
    label: o.labelVi || o.value,
  }));
  const base = `Thêm vào form đăng ký hiện có (giữ nguyên mọi trường khác) một select name="${key}", nhãn "${label}", bắt buộc chọn.`;
  return base + optionRule(key, selectMarkup(key, placeholder, options, true));
}
