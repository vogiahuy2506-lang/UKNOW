/**
 * Hiện / ẩn ô theo câu trả lời — `field.showIf` (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8a).
 *
 *   showIf: { match: 'all' | 'any', conditions: [{ fieldKey, operator, value? }] }   (tối đa MAX_SHOW_IF_CONDITIONS điều kiện)
 *
 * Quy tắc (NGUỒN SỰ THẬT — bản frontend `frontend/src/features/forms/utils/formShowIf.util.js` sao các hàm thuần bên dưới và có
 * test hợp đồng `utils/__tests__/formShowIf.contract.spec.js`; lệch thì backend đúng):
 *  - Áp cho mọi trường (nhập, tiêu đề, đoạn chữ) TRỪ `page_break`.
 *  - Nguồn của điều kiện phải là trường NHẬP đứng TRƯỚC trường đang xét (không tham chiếu tới sau, không tham chiếu chính nó
 *    nên không thể có vòng). `file` không làm nguồn được (câu trả lời của nó là tệp, không phải giá trị đọc được).
 *  - Toán tử theo loại nguồn:
 *      select / radio / yes_no / rating / number → equals, not_equals, answered, not_answered
 *      checkbox                                   → contains, answered, not_answered
 *      short_text / long_text / email / phone / date / time → answered, not_answered
 *    `value` bắt buộc với equals / not_equals / contains và phải hợp loại nguồn: một lựa chọn CÓ THẬT (select/radio/checkbox),
 *    "yes"|"no", số nguyên 1..5, một số hữu hạn. `answered` / `not_answered` không có `value`.
 *  - `not_equals` đúng cả khi nguồn CHƯA trả lời (chưa trả lời thì chắc chắn khác giá trị đó).
 *  - Nguồn đang bị ẩn coi như CHƯA trả lời (câu trả lời của trường ẩn bị bỏ), nên ẩn lan theo chuỗi: A ẩn → ô dựa vào A thấy A
 *    "chưa trả lời".
 *  - Dữ liệu cũ / lỗi (nguồn không còn, điều kiện hỏng) → điều kiện đó bị BỎ QUA khi đánh giá; không còn điều kiện nào dùng được
 *    thì ô LUÔN HIỆN (không để mất khách vì cấu hình hỏng).
 *
 * File này chỉ import formFieldTypes.util.js (không import formDefinition) nên formDefinition / formSubmission cùng dùng được.
 */

import { isDisplayFieldType, RATING_MAX, YES_NO_VALUES } from './formFieldTypes.util.js';

export const SHOW_IF_MATCH_MODES = Object.freeze(['all', 'any']);
export const SHOW_IF_OPERATORS = Object.freeze(['equals', 'not_equals', 'contains', 'answered', 'not_answered']);
/** Toán tử cần `value`. */
export const SHOW_IF_VALUE_OPERATORS = Object.freeze(['equals', 'not_equals', 'contains']);
export const MAX_SHOW_IF_CONDITIONS = 5;

const EQUALITY_OPERATORS = Object.freeze(['equals', 'not_equals', 'answered', 'not_answered']);
const ANSWERED_ONLY_OPERATORS = Object.freeze(['answered', 'not_answered']);
const CHECKBOX_OPERATORS = Object.freeze(['contains', 'answered', 'not_answered']);

const OPERATORS_BY_SOURCE_TYPE = Object.freeze({
  select: EQUALITY_OPERATORS,
  radio: EQUALITY_OPERATORS,
  yes_no: EQUALITY_OPERATORS,
  rating: EQUALITY_OPERATORS,
  number: EQUALITY_OPERATORS,
  checkbox: CHECKBOX_OPERATORS,
  short_text: ANSWERED_ONLY_OPERATORS,
  long_text: ANSWERED_ONLY_OPERATORS,
  email: ANSWERED_ONLY_OPERATORS,
  phone: ANSWERED_ONLY_OPERATORS,
  date: ANSWERED_ONLY_OPERATORS,
  time: ANSWERED_ONLY_OPERATORS,
});

/**
 * @param {unknown} type
 * @returns {string[]} toán tử dùng được khi trường loại `type` làm nguồn; mảng rỗng nếu loại đó không làm nguồn được
 */
export function getShowIfOperatorsForType(type) {
  const list = OPERATORS_BY_SOURCE_TYPE[String(type || '').trim().toLowerCase()];
  return list ? [...list] : [];
}

/** @returns {boolean} true nếu trường loại `type` làm nguồn điều kiện được */
export function isShowIfSourceType(type) {
  return getShowIfOperatorsForType(type).length > 0;
}

/** @returns {boolean} true nếu toán tử cần `value` */
export function showIfOperatorNeedsValue(operator) {
  return SHOW_IF_VALUE_OPERATORS.includes(operator);
}

/** Danh sách giá trị lựa chọn của trường (chấp nhận cả `{label, value}` của backend lẫn chuỗi của trình soạn). */
function optionValuesOf(field) {
  const options = Array.isArray(field?.options) ? field.options : [];
  const values = [];
  for (const opt of options) {
    const text = opt && typeof opt === 'object' ? String(opt.value ?? opt.label ?? '').trim() : String(opt ?? '').trim();
    if (text) values.push(text);
  }
  return values;
}

/** Giá trị điều kiện → dạng chuẩn theo loại nguồn, hoặc `undefined` nếu không hợp lệ. */
function canonicalizeConditionValue(sourceField, value) {
  const type = String(sourceField?.type || '').trim().toLowerCase();
  const asText = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  if (type === 'select' || type === 'radio' || type === 'checkbox') {
    return asText && optionValuesOf(sourceField).includes(asText) ? asText : undefined;
  }
  if (type === 'yes_no') {
    const yn = asText.toLowerCase();
    return YES_NO_VALUES.includes(yn) ? yn : undefined;
  }
  if (type === 'rating') {
    const n = typeof value === 'number' ? value : /^\d+$/.test(asText) ? Number(asText) : NaN;
    return Number.isInteger(n) && n >= 1 && n <= RATING_MAX ? n : undefined;
  }
  if (type === 'number') {
    const n = typeof value === 'number' ? value : /^-?\d+(\.\d+)?$/.test(asText) ? Number(asText) : NaN;
    return Number.isFinite(n) && Math.abs(n) <= 1e15 ? n : undefined;
  }
  return undefined;
}

/**
 * Kiểm MỘT điều kiện với trường nguồn của nó.
 *
 * @param {object|null|undefined} sourceField trường nguồn (đã tìm ra theo `fieldKey`); thiếu → reason 'source'
 * @param {unknown} operator
 * @param {unknown} value
 * @returns {{ ok: true, operator: string, value?: string|number } | { ok: false, reason: 'source'|'sourceType'|'operator'|'value' }}
 *   `value` chỉ có khi toán tử cần giá trị, đã chuẩn hoá (chuỗi lựa chọn / "yes"|"no" / số)
 */
export function checkShowIfCondition(sourceField, operator, value) {
  if (!sourceField || typeof sourceField !== 'object') return { ok: false, reason: 'source' };
  const allowed = getShowIfOperatorsForType(sourceField.type);
  if (allowed.length === 0) return { ok: false, reason: 'sourceType' };
  const op = String(operator ?? '').trim().toLowerCase();
  if (!allowed.includes(op)) return { ok: false, reason: 'operator' };
  if (!showIfOperatorNeedsValue(op)) return { ok: true, operator: op };
  const canonical = canonicalizeConditionValue(sourceField, value);
  if (canonical === undefined) return { ok: false, reason: 'value' };
  return { ok: true, operator: op, value: canonical };
}

/** Câu trả lời thô → dạng so sánh: checkbox = mảng chuỗi (đã trim, bỏ rỗng); loại khác = chuỗi đã trim ("" nếu không phải vô hướng). */
function readAnswer(type, raw) {
  if (type === 'checkbox') {
    const items = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
    return items
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return '';
}

function evaluateCondition(sourceType, check, raw) {
  const answer = readAnswer(sourceType, raw);
  const answered = Array.isArray(answer) ? answer.length > 0 : answer !== '';
  if (check.operator === 'answered') return answered;
  if (check.operator === 'not_answered') return !answered;
  if (check.operator === 'contains') return Array.isArray(answer) && answer.includes(String(check.value));

  let equal = false;
  if (answered && !Array.isArray(answer)) {
    if (sourceType === 'rating' || sourceType === 'number') {
      const n = Number(answer);
      equal = Number.isFinite(n) && n === Number(check.value);
    } else if (sourceType === 'yes_no') {
      equal = answer.toLowerCase() === check.value;
    } else {
      equal = answer === String(check.value);
    }
  }
  return check.operator === 'equals' ? equal : !equal;
}

/**
 * `showIf` của một trường có đang thoả không (đánh giá với các nguồn đã biết).
 *
 * @param {unknown} showIf
 * @param {Map<string, object>} inputsSoFar các trường NHẬP đứng trước, theo key (kể cả trường đang ẩn)
 * @param {Map<string, unknown>} effectiveAnswers câu trả lời của các trường nhập đang HIỆN (trường ẩn không có mặt = chưa trả lời)
 * @returns {boolean}
 */
function isShowIfSatisfied(showIf, inputsSoFar, effectiveAnswers) {
  if (!showIf || typeof showIf !== 'object' || !Array.isArray(showIf.conditions)) return true;
  const results = [];
  for (const condition of showIf.conditions) {
    if (!condition || typeof condition !== 'object') continue;
    const source = inputsSoFar.get(condition.fieldKey);
    if (!source) continue;
    const check = checkShowIfCondition(source, condition.operator, condition.value);
    if (!check.ok) continue;
    results.push(evaluateCondition(String(source.type).toLowerCase(), check, effectiveAnswers.get(source.key)));
  }
  if (results.length === 0) return true;
  return showIf.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * HÀM THUẦN DÙNG CHUNG (backend validate bài nộp + renderer): tập `key` của các trường đang HIỆN với bộ câu trả lời `answers`.
 * Duyệt theo thứ tự trường; trường ẩn không đóng góp câu trả lời cho các trường đứng sau (nên ẩn lan theo chuỗi).
 * `page_break` luôn có trong kết quả (nó là ranh giới trang, không có điều kiện).
 *
 * @param {Array<{ key: string, type: string, showIf?: object, options?: any[] }>} fields
 * @param {Record<string, unknown>} answers câu trả lời thô theo key (chuỗi / số / mảng cho checkbox)
 * @returns {Set<string>}
 */
export function getVisibleFieldKeys(fields, answers) {
  const list = Array.isArray(fields) ? fields : [];
  const safeAnswers = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {};
  const visible = new Set();
  const inputsSoFar = new Map();
  const effectiveAnswers = new Map();

  for (const field of list) {
    if (!field || typeof field !== 'object') continue;
    const shown = field.type === 'page_break' || isShowIfSatisfied(field.showIf, inputsSoFar, effectiveAnswers);
    if (shown) visible.add(field.key);
    if (!isDisplayFieldType(field.type)) {
      inputsSoFar.set(field.key, field);
      if (shown) effectiveAnswers.set(field.key, safeAnswers[field.key]);
    }
  }
  return visible;
}

// ─── Chuẩn hoá lúc LƯU biểu mẫu (chỉ backend) ──────────────────────────────────────────────────────────────────────────

function createShowIfError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'INVALID_FORM_DEFINITION';
  return err;
}

const clipLabel = (label) => String(label || '').slice(0, 30);

/**
 * Chuẩn hoá `showIf` thô của MỘT trường lúc lưu. Điều kiện sai thì báo lỗi rõ (400) chứ không lặng lẽ bỏ: người gọi API thấy ngay
 * mình tham chiếu sai. Không có điều kiện nào (`null` / `undefined` / mảng rỗng) = trường luôn hiện → trả `null`.
 *
 * @param {unknown} raw
 * @param {object} context
 * @param {string} context.label nhãn trường đang xét (cho câu báo lỗi)
 * @param {Map<string, object>} context.precedingFields MỌI trường đứng trước (đã chuẩn hoá), theo key
 * @param {Set<string>} context.laterKeys khoá thô của trường đứng SAU hoặc chính trường này (để báo lỗi "phải đứng trước")
 * @returns {{ match: 'all'|'any', conditions: Array<{ fieldKey: string, operator: string, value?: string|number }> }|null}
 */
export function normalizeShowIf(raw, { label, precedingFields, laterKeys }) {
  if (raw === undefined || raw === null) return null;
  const where = `Điều kiện hiển thị của trường "${clipLabel(label)}"`;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createShowIfError(`${where} không hợp lệ`);
  }

  const rawConditions = raw.conditions;
  if (rawConditions === undefined || rawConditions === null) return null;
  if (!Array.isArray(rawConditions)) throw createShowIfError(`${where} không hợp lệ (conditions phải là một mảng)`);
  if (rawConditions.length === 0) return null;
  if (rawConditions.length > MAX_SHOW_IF_CONDITIONS) {
    throw createShowIfError(`${where} vượt quá ${MAX_SHOW_IF_CONDITIONS} điều kiện (đang có ${rawConditions.length})`);
  }

  let match = 'all';
  if (raw.match !== undefined && raw.match !== null && raw.match !== '') {
    match = String(raw.match).trim().toLowerCase();
    if (!SHOW_IF_MATCH_MODES.includes(match)) {
      throw createShowIfError(`${where} không hợp lệ (match chỉ nhận ${SHOW_IF_MATCH_MODES.join(' hoặc ')})`);
    }
  }

  const conditions = rawConditions.map((rawCondition, i) => {
    if (!rawCondition || typeof rawCondition !== 'object' || Array.isArray(rawCondition)) {
      throw createShowIfError(`${where}: điều kiện thứ ${i + 1} không hợp lệ`);
    }
    const fieldKey = typeof rawCondition.fieldKey === 'string' ? rawCondition.fieldKey.trim() : '';
    const source = fieldKey ? precedingFields.get(fieldKey) : undefined;
    if (!source) {
      if (fieldKey && laterKeys.has(fieldKey)) {
        throw createShowIfError(
          `${where}: điều kiện thứ ${i + 1} dựa vào một trường đứng SAU (hoặc chính trường này) — chỉ được dựa vào ô nhập đứng trước`
        );
      }
      throw createShowIfError(`${where}: điều kiện thứ ${i + 1} dựa vào trường không tồn tại${fieldKey ? ` ("${fieldKey.slice(0, 32)}")` : ''}`);
    }
    const check = checkShowIfCondition(source, rawCondition.operator, rawCondition.value);
    if (!check.ok) {
      const sourceLabel = clipLabel(source.label);
      if (check.reason === 'sourceType') {
        throw createShowIfError(`${where}: điều kiện thứ ${i + 1} dựa vào "${sourceLabel}" nhưng loại trường đó không dùng làm điều kiện được`);
      }
      if (check.reason === 'operator') {
        throw createShowIfError(
          `${where}: toán tử "${String(rawCondition.operator ?? '').slice(0, 20)}" không dùng được với trường "${sourceLabel}" (chỉ nhận ${getShowIfOperatorsForType(source.type).join(', ')})`
        );
      }
      throw createShowIfError(`${where}: giá trị của điều kiện thứ ${i + 1} không hợp lệ với trường "${sourceLabel}"`);
    }
    return {
      fieldKey,
      operator: check.operator,
      ...(check.value !== undefined ? { value: check.value } : {}),
    };
  });

  return { match, conditions };
}
