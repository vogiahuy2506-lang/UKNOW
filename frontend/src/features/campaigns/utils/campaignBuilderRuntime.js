/**
 * Runtime helper utilities for CampaignBuilder execution pipeline.
 * These are intentionally pure to keep behavior deterministic.
 */
export const inferValueType = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

/** Không tạo cột auto-schema cho các key chỉ phục vụ tiến độ log (trùng message tổng). */
const KEYS_OMIT_FROM_AUTO_SCHEMA = new Set(['messageText']);

export const buildSchemaFromRows = (rows) => {
  const first = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!first || typeof first !== 'object') return [];
  return Object.keys(first)
    .filter((key) => !KEYS_OMIT_FROM_AUTO_SCHEMA.has(key))
    .map((key) => ({
      key,
      type: inferValueType(first[key]),
    }));
};

export const normalizeKey = (key) => String(key || '').trim();

export const colLettersToNumber = (letters) => {
  const source = String(letters || '').toUpperCase();
  let number = 0;
  for (let idx = 0; idx < source.length; idx += 1) {
    const code = source.charCodeAt(idx);
    if (code < 65 || code > 90) return null;
    number = number * 26 + (code - 64);
  }
  return number;
};

export const resolveColumnKey = (row, ref) => {
  const key = normalizeKey(ref);
  if (!key) return '';
  if (/^[A-Za-z]+$/.test(key)) {
    const idx = colLettersToNumber(key);
    return idx ? `col_${idx}` : key;
  }
  if (row && typeof row === 'object') {
    const exact = Object.prototype.hasOwnProperty.call(row, key) ? key : null;
    if (exact) return exact;
    const lowerMap = new Map(Object.keys(row).map((itemKey) => [String(itemKey).toLowerCase(), itemKey]));
    return lowerMap.get(key.toLowerCase()) || key;
  }
  return key;
};

export const parseEmailList = (text) =>
  String(text || '')
    .split(/[\n,;]/g)
    .map((item) => item.trim())
    .filter(Boolean);

export const renderTemplateString = (input, vars) =>
  String(input || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = vars?.[key];
    return value === undefined || value === null ? '' : String(value);
  });

export const applyMappingsForRow = (row, mappings) => {
  const vars = {};
  (mappings || []).forEach((mapping) => {
    const name = normalizeKey(mapping.variableName);
    if (!name) return;
    if (mapping.sourceType === 'column') {
      const key = resolveColumnKey(row, mapping.columnName);
      vars[name] = row?.[key] ?? '';
    } else if (mapping.sourceType === 'static') {
      vars[name] = mapping.formula ?? '';
    } else if (mapping.sourceType === 'formula') {
      const raw = String(mapping.formula || '');
      vars[name] = raw.replace(/col_([A-Za-z]+)/g, (_, letters) => {
        const colKey = resolveColumnKey(row, letters);
        return String(row?.[colKey] ?? '');
      });
    }
  });
  return vars;
};
