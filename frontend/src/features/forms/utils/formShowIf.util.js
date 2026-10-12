/**
 * Hiện / ẩn ô theo câu trả lời (`field.showIf`) — bản FRONTEND của backend/src/utils/formShowIf.util.js
 * (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8a). Lệch với backend thì backend đúng; hợp đồng được ghim ở
 * backend/src/utils/__tests__/formShowIf.contract.spec.js (cùng hằng số, cùng kết quả `checkShowIfCondition` / `getVisibleFieldKeys`).
 *
 *   showIf: { match: 'all' | 'any', conditions: [{ fieldKey, operator, value? }] }   (tối đa MAX_SHOW_IF_CONDITIONS điều kiện)
 *
 * Phần "HÀM THUẦN DÙNG CHUNG" sao nguyên logic backend (renderer dùng `getVisibleFieldKeys` để ẩn / hiện tức thì, bỏ giá trị ô ẩn,
 * bỏ trang rỗng, kiểm bắt buộc chỉ trên ô hiện). Phần "TRÌNH SOẠN" chỉ có ở frontend: trạng thái nháp dùng chuỗi cho `value`,
 * trường mới chưa có `key` — xem từng hàm.
 */

import { isDisplayFieldType, RATING_MAX } from './formFieldTypes.util';

export const SHOW_IF_MATCH_MODES = ['all', 'any'];
export const SHOW_IF_OPERATORS = ['equals', 'not_equals', 'contains', 'answered', 'not_answered'];
/** Toán tử cần `value`. */
export const SHOW_IF_VALUE_OPERATORS = ['equals', 'not_equals', 'contains'];
export const MAX_SHOW_IF_CONDITIONS = 5;

const YES_NO_VALUES = ['yes', 'no'];
const EQUALITY_OPERATORS = ['equals', 'not_equals', 'answered', 'not_answered'];
const ANSWERED_ONLY_OPERATORS = ['answered', 'not_answered'];
const CHECKBOX_OPERATORS = ['contains', 'answered', 'not_answered'];

const OPERATORS_BY_SOURCE_TYPE = {
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
};

// ─── HÀM THUẦN DÙNG CHUNG (sao từ backend) ──────────────────────────────────────────────────────────────────────────────

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
export function optionValuesOf(field) {
  const options = Array.isArray(field?.options) ? field.options : [];
  const values = [];
  for (const opt of options) {
    const text = opt && typeof opt === 'object' ? String(opt.value ?? opt.label ?? '').trim() : String(opt ?? '').trim();
    if (text) values.push(text);
  }
  return values;
}

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
 * @param {object|null|undefined} sourceField
 * @param {unknown} operator
 * @param {unknown} value
 * @returns {{ ok: true, operator: string, value?: string|number } | { ok: false, reason: 'source'|'sourceType'|'operator'|'value' }}
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
 * Tập `key` của các trường đang HIỆN với bộ câu trả lời `answers` (xem bản backend để biết đủ quy tắc: nguồn đang ẩn coi như chưa
 * trả lời nên ẩn lan theo chuỗi; điều kiện hỏng bị bỏ qua; `page_break` luôn có mặt).
 *
 * @param {Array<{ key: string, type: string, showIf?: object, options?: any[] }>} fields
 * @param {Record<string, unknown>} answers câu trả lời thô theo key
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

/** @returns {boolean} true nếu có ít nhất một trường mang điều kiện hiển thị dùng được (cấu trúc đủ để đánh giá) */
export function hasShowIf(fields) {
  return (Array.isArray(fields) ? fields : []).some(
    (f) => f && f.type !== 'page_break' && Array.isArray(f.showIf?.conditions) && f.showIf.conditions.length > 0
  );
}

/** Tập `key` của các trường đang là NGUỒN của một điều kiện nào đó (xem trước cho phép bấm thử đúng những ô này). */
export function getShowIfSourceKeys(fields) {
  const keys = new Set();
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f || f.type === 'page_break' || !Array.isArray(f.showIf?.conditions)) continue;
    for (const c of f.showIf.conditions) {
      if (c && typeof c.fieldKey === 'string' && c.fieldKey) keys.add(c.fieldKey);
    }
  }
  return keys;
}

// ─── TRÌNH SOẠN (chỉ frontend) ──────────────────────────────────────────────────────────────────────────────────────────
//
// Trường trong state trình soạn: `{ uid, key, type, options: string[], showIf: { match, conditions: [{ fieldKey, operator, value }] } | null }`.
// `value` giữ dạng chuỗi (gõ dở "1." không bị ép); chuyển thành số ở `toPayloadShowIf`.

/**
 * Điều kiện nào của danh sách trường trình soạn đang HỎNG (nguồn bị xoá / đứng sau / đổi loại / lựa chọn không còn…).
 * Chỉ trường đứng TRƯỚC (đã có `key`) mới làm nguồn được. `page_break` không có điều kiện nên mọi `showIf` còn sót trên nó cũng là lỗi.
 *
 * @param {Array<{ uid: string, key?: string, type: string, options?: string[], showIf?: object|null }>} fields
 * @returns {Array<{ uid: string, index: number, conditionIndex: number, reason: 'source'|'sourceType'|'operator'|'value'|'pageBreak' }>}
 */
export function findShowIfIssues(fields) {
  const issues = [];
  const earlier = new Map();
  (Array.isArray(fields) ? fields : []).forEach((field, index) => {
    const conditions = field?.showIf?.conditions;
    if (Array.isArray(conditions) && conditions.length > 0) {
      if (field.type === 'page_break') {
        issues.push({ uid: field.uid, index, conditionIndex: 0, reason: 'pageBreak' });
      } else {
        conditions.forEach((condition, conditionIndex) => {
          const source = earlier.get(String(condition?.fieldKey || '').trim());
          const check = checkShowIfCondition(source, condition?.operator, condition?.value);
          if (!check.ok) issues.push({ uid: field.uid, index, conditionIndex, reason: check.reason });
        });
      }
    }
    const key = String(field?.key || '').trim();
    if (key) earlier.set(key, field);
  });
  return issues;
}

/**
 * `showIf` của trình soạn → dạng GỬI LÊN server / dùng cho xem trước: chỉ giữ điều kiện còn hợp lệ, `value` đã chuẩn (số cho
 * rating / number). Không còn điều kiện nào → `null`. Số điều kiện bị bỏ trả kèm để báo người dùng.
 *
 * @param {object|null|undefined} showIf
 * @param {Map<string, object>} earlierFields các trường đứng trước, theo key
 * @returns {{ showIf: { match: 'all'|'any', conditions: object[] }|null, removed: number }}
 */
export function toPayloadShowIf(showIf, earlierFields) {
  const conditions = Array.isArray(showIf?.conditions) ? showIf.conditions : [];
  const kept = [];
  for (const condition of conditions.slice(0, MAX_SHOW_IF_CONDITIONS)) {
    const fieldKey = String(condition?.fieldKey || '').trim();
    const check = checkShowIfCondition(earlierFields.get(fieldKey), condition?.operator, condition?.value);
    if (!check.ok) continue;
    kept.push({ fieldKey, operator: check.operator, ...(check.value !== undefined ? { value: check.value } : {}) });
  }
  const removed = conditions.length - kept.length;
  if (kept.length === 0) return { showIf: null, removed };
  return { showIf: { match: showIf.match === 'any' ? 'any' : 'all', conditions: kept }, removed };
}

/**
 * Dọn điều kiện hỏng khỏi danh sách trường trình soạn (gọi trước khi lưu và khi dựng xem trước). Trường không đổi giữ nguyên tham
 * chiếu; trường còn điều kiện dùng được mang `showIf` ĐÃ chuẩn hoá theo dạng gửi lên server.
 *
 * @param {Array<object>} fields
 * @returns {{ fields: Array<object>, removed: number }} `removed` = số điều kiện bị gỡ
 */
export function sanitizeEditorShowIf(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const earlier = new Map();
  let removed = 0;
  const out = list.map((field) => {
    let next = field;
    const hasConditions = Array.isArray(field?.showIf?.conditions) && field.showIf.conditions.length > 0;
    if (hasConditions) {
      if (field.type === 'page_break') {
        removed += field.showIf.conditions.length;
        next = { ...field, showIf: null };
      } else {
        const result = toPayloadShowIf(field.showIf, earlier);
        removed += result.removed;
        if (result.removed > 0 || result.showIf === null) {
          next = {
            ...field,
            showIf: result.showIf
              ? { match: result.showIf.match, conditions: result.showIf.conditions.map((c) => ({ ...c, value: c.value === undefined ? '' : String(c.value) })) }
              : null,
          };
        }
      }
    }
    const key = String(field?.key || '').trim();
    if (key) earlier.set(key, field);
    return next;
  });
  return { fields: out, removed };
}

/**
 * Đổi tên một lựa chọn của trường nguồn: các điều kiện đang trỏ đúng lựa chọn cũ chuyển sang chữ mới (để gõ lại tên lựa chọn
 * không làm hỏng điều kiện). So sánh theo chữ NGUYÊN VĂN trong ô nhập (kể cả khoảng trắng đang gõ dở).
 *
 * @returns {Array<object>} danh sách trường mới (cùng tham chiếu nếu không có gì đổi)
 */
export function renameOptionInConditions(fields, sourceKey, oldText, newText) {
  const key = String(sourceKey || '').trim();
  if (!key || oldText === newText) return fields;
  let changed = false;
  const out = fields.map((field) => {
    const conditions = field?.showIf?.conditions;
    if (!Array.isArray(conditions) || !conditions.some((c) => c?.fieldKey === key && c?.value === oldText)) return field;
    changed = true;
    return {
      ...field,
      showIf: { ...field.showIf, conditions: conditions.map((c) => (c?.fieldKey === key && c?.value === oldText ? { ...c, value: newText } : c)) },
    };
  });
  return changed ? out : fields;
}
