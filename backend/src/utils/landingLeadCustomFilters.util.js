import { CUSTOM_FIELD_KEY_RE, FORBIDDEN_FIELD_KEYS } from './landingLeadFormConfig.util.js';

export const MAX_CUSTOM_FILTERS = 10;
export const CUSTOM_FILTER_CONTAINS_MAX = 200;
export const CUSTOM_FILTER_IN_MAX_VALUES = 50;

const EQ_IN_OPERATORS = new Set(['eq', 'in']);
const CONTAINS_OPERATORS = new Set(['contains']);
const ALL_OPERATORS = new Set(['eq', 'in', 'contains']);
const TEXT_FIELD_TYPES = new Set(['text', 'textarea']);
const CHOICE_FIELD_TYPES = new Set(['select', 'radio', 'checkbox']);

/**
 * Operator hợp lệ theo loại field (M5): text/textarea → contains; select/radio/checkbox → eq|in.
 * Type không biết (field đã xóa) → giữ toàn bộ operator để campaign cũ vẫn chạy.
 *
 * @param {string} [type]
 * @returns {Set<string>}
 */
export function operatorsAllowedForCustomFieldType(type) {
  if (TEXT_FIELD_TYPES.has(type)) return CONTAINS_OPERATORS;
  if (CHOICE_FIELD_TYPES.has(type)) return EQ_IN_OPERATORS;
  return ALL_OPERATORS;
}

function toFieldTypeMap(fieldTypeByKey) {
  if (!fieldTypeByKey) return null;
  if (fieldTypeByKey instanceof Map) return fieldTypeByKey;
  if (typeof fieldTypeByKey === 'object') return new Map(Object.entries(fieldTypeByKey));
  return null;
}

function filterError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function escapeIlike(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Chuẩn hóa `landingLeadsCustomFilters` từ query/config.
 * Key/operator/value validate; không nối JSON path từ client.
 *
 * @param {unknown} raw
 * @param {{ fieldTypeByKey?: Map<string, string>|Record<string, string> }} [opts]
 * @returns {{ key: string, operator: string, values: string[] }[]}
 */
export function normalizeLandingLeadsCustomFilters(raw, opts = {}) {
  let list = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      list = JSON.parse(trimmed);
    } catch {
      throw filterError('landingLeadsCustomFilters không hợp lệ');
    }
  }
  if (list == null || list === '') return [];
  if (!Array.isArray(list)) {
    throw filterError('landingLeadsCustomFilters không hợp lệ');
  }
  if (list.length > MAX_CUSTOM_FILTERS) {
    throw filterError(`Tối đa ${MAX_CUSTOM_FILTERS} bộ lọc trường tùy chỉnh`);
  }

  const typeMap = toFieldTypeMap(opts.fieldTypeByKey);
  const out = [];
  for (const item of list) {
    if (!isPlainObject(item)) {
      throw filterError('Bộ lọc trường tùy chỉnh không hợp lệ');
    }
    const key = String(item.key || '').trim();
    if (!CUSTOM_FIELD_KEY_RE.test(key) || FORBIDDEN_FIELD_KEYS.has(key)) {
      throw filterError('Mã trường lọc không hợp lệ');
    }
    const operator = String(item.operator || '').trim().toLowerCase();
    if (!ALL_OPERATORS.has(operator)) {
      throw filterError('Toán tử lọc không hợp lệ');
    }
    const knownType = typeMap?.get(key);
    if (knownType && !operatorsAllowedForCustomFieldType(knownType).has(operator)) {
      throw filterError('Toán tử lọc không khớp loại trường');
    }

    let values = [];
    if (operator === 'in') {
      const rawValues = Array.isArray(item.values)
        ? item.values
        : (item.value != null ? [item.value] : []);
      values = rawValues.map((v) => String(v ?? '').trim()).filter(Boolean);
      if (values.length < 1 || values.length > CUSTOM_FILTER_IN_MAX_VALUES) {
        throw filterError('Danh sách giá trị lọc không hợp lệ');
      }
    } else if (operator === 'eq') {
      const value = item.value != null ? String(item.value).trim() : '';
      if (!value && item.value !== false && item.value !== true) {
        throw filterError('Giá trị lọc không được để trống');
      }
      values = [item.value === true ? 'true' : item.value === false ? 'false' : value];
    } else if (operator === 'contains') {
      const value = String(item.value ?? '').trim();
      if (!value || value.length > CUSTOM_FILTER_CONTAINS_MAX) {
        throw filterError('Giá trị tìm kiếm không hợp lệ');
      }
      if (!CONTAINS_OPERATORS.has(operator)) {
        throw filterError('Toán tử lọc không hợp lệ');
      }
      values = [value];
    }

    if (operator === 'eq' || operator === 'in') {
      if (!EQ_IN_OPERATORS.has(operator)) {
        throw filterError('Toán tử lọc không hợp lệ');
      }
    }

    out.push({ key, operator, values });
  }
  return out;
}

/**
 * Gắn điều kiện parameterized: `custom_fields -> $n ->> 'value'`.
 *
 * @param {{ conditions: string[], params: unknown[], idx: number }} ctx
 * @param {{ key: string, operator: string, values: string[] }[]} filters
 * @returns {{ conditions: string[], params: unknown[], idx: number }}
 */
export function appendCustomFieldFilterSql(ctx, filters) {
  const conditions = ctx.conditions;
  const params = ctx.params;
  let idx = ctx.idx;
  const list = Array.isArray(filters) ? filters : [];

  for (const filter of list) {
    const pathParam = idx;
    params.push(filter.key);
    idx += 1;
    const pathExpr = `custom_fields -> $${pathParam} ->> 'value'`;

    if (filter.operator === 'eq') {
      conditions.push(`${pathExpr} = $${idx}`);
      params.push(filter.values[0]);
      idx += 1;
    } else if (filter.operator === 'in') {
      conditions.push(`${pathExpr} = ANY($${idx}::text[])`);
      params.push(filter.values);
      idx += 1;
    } else if (filter.operator === 'contains') {
      conditions.push(`${pathExpr} ILIKE $${idx} ESCAPE '\\'`);
      params.push(`%${escapeIlike(filter.values[0])}%`);
      idx += 1;
    }
  }

  return { conditions, params, idx };
}
