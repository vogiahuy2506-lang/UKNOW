/**
 * Kiểm tra form.htmlContent (HTML trang landing) có khớp cấu hình form đăng ký hay chưa —
 * dùng cho cảnh báo trong LeadFormConfigPanel (section "Form đăng ký" của Cài đặt trang).
 *
 * Hai mức kiểm, đều KHÔNG chặn lưu (chỉ cảnh báo + nút nhờ AI):
 *   1. htmlHasFieldName   — trang có ô name="<khoá>" chưa (PR-2d-3 việc 3).
 *   2. htmlHasFieldOptions — ô select/radio có ĐÚNG mã <option value>/<input value> đã lưu chưa.
 *
 * Mức 2 sinh ra từ sự cố 09/09 trên trang slug-test: AI thêm ô select đúng name nhưng ghi
 * `<option value="Lựa chọn 1">` (nhãn) thay vì `value="opt_a"` (mã) → backend
 * normalizeCustomSubmitValue đối chiếu field.options[].value nên từ chối MỌI lượt đăng ký với
 * "<nhãn> không hợp lệ"; với occupation/interestArea thì normalizeOptionalSelectValue đổi thành
 * '' trong im lặng. Cả hai đều lọt qua kiểm mức 1 vì name có mặt.
 */

import {
  founder_OCCUPATION_OPTIONS,
  founder_INTEREST_OPTIONS,
} from '../../landing/constants/founder-landing-options.js';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Regex bắt `value="<v>"` — chấp nhận cả dạng đã thoát HTML (`&amp;`), vì trình duyệt giải
 * mã thực thể khi đọc select.value nên `value="A &amp; B"` gửi lên vẫn là `A & B` hợp lệ.
 */
function valueAttrRe(v) {
  const raw = escapeRegExp(v);
  const escaped = escapeRegExp(escapeHtml(v));
  return new RegExp(`\\bvalue\\s*=\\s*["'](?:${raw}|${escaped})["']`, 'i');
}

function nameAttrRe(key) {
  return new RegExp(`\\bname\\s*=\\s*["']${escapeRegExp(key)}["']`, 'i');
}

/**
 * @param {string} html
 * @param {string} key
 * @returns {boolean}
 */
export function htmlHasFieldName(html, key) {
  if (!key) return true;
  return nameAttrRe(key).test(String(html || ''));
}

/**
 * Mọi mã trong `optionValues` phải có mặt trên ô name="<key>":
 *  - có <select name=key>: MỌI khối select đó (trang AI hay sinh 2 form hero + footer) phải
 *    chứa đủ mã;
 *  - không có select nhưng có <input name=key> (radio): tập value của các input phải phủ đủ;
 *  - name nằm trên phần tử khác (vd AI sinh input text cho field kiểu select) → false.
 * Chấp nhận select↔radio lẫn nhau vì hợp đồng gửi lên (giá trị = mã) giống nhau.
 *
 * @param {string} html
 * @param {string} key
 * @param {string[]} optionValues
 * @returns {boolean} true khi không có gì để kiểm (optionValues rỗng) hoặc đủ mã
 */
export function htmlHasFieldOptions(html, key, optionValues) {
  const values = (Array.isArray(optionValues) ? optionValues : []).map((v) => String(v ?? '').trim()).filter(Boolean);
  if (!values.length) return true;
  const source = String(html || '');
  if (!key) return true;

  const nameRe = nameAttrRe(key);
  const selectBlocks = (source.match(/<select\b[^>]*>[\s\S]*?<\/select>/gi) || []).filter((block) => {
    const openTag = block.match(/^<select\b[^>]*>/i)?.[0] || '';
    return nameRe.test(openTag);
  });
  if (selectBlocks.length) {
    return selectBlocks.every((block) => values.every((v) => valueAttrRe(v).test(block)));
  }

  const inputs = (source.match(/<input\b[^>]*>/gi) || []).filter((tag) => nameRe.test(tag));
  if (inputs.length) {
    return values.every((v) => inputs.some((tag) => valueAttrRe(v).test(tag)));
  }

  return false;
}

/**
 * Mã option cấu hình yêu cầu cho một trường — rỗng với kiểu không có lựa chọn.
 * @param {{ type?: string, options?: Array<{ value: string }> }} field
 * @returns {string[]}
 */
export function customFieldOptionValues(field) {
  if (!field || (field.type !== 'select' && field.type !== 'radio')) return [];
  return (Array.isArray(field.options) ? field.options : []).map((o) => String(o?.value ?? '').trim()).filter(Boolean);
}

/**
 * Mã option của trường cố định — trùng OCCUPATION_VALUES/INTEREST_AREA_VALUES backend
 * (founder-landing-options.js: value === labelVi).
 * @param {'occupation'|'interestArea'} key
 * @returns {string[]}
 */
export function fixedFieldOptionValues(key) {
  const list = key === 'occupation' ? founder_OCCUPATION_OPTIONS : key === 'interestArea' ? founder_INTEREST_OPTIONS : [];
  return list.map((o) => o.value);
}
