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

/**
 * Đọc một trường của item theo tên, KHÔNG phân biệt hoa/thường.
 *
 * Vì sao không dùng lại `resolveColumnKey`: hàm đó coi mọi chuỗi toàn chữ cái là **tên cột kiểu
 * Excel** (dòng 41-43), nên `'email'` sẽ bị đọc thành cột E,M,A,I,L → `col_N`. Đúng cho ô nhập
 * "cột người nhận" (nơi người dùng gõ `B`, `C`…), nhưng sai hoàn toàn cho `recipientField` — thứ
 * luôn là TÊN CỘT.
 *
 * Bug thật 25/08/2026: trợ lý AI luôn sinh `recipientField: "email"` (chữ thường, cố định ở
 * `aiCampaignDraft.service.js:522`), trong khi tiêu đề cột trong Sheet/Excel của người dùng
 * thường viết hoa — `Email`. Tra khoá thô `item['email']` trả `undefined`, danh sách người nhận
 * rỗng, node gửi 0 tin và **không báo lỗi gì**. Sheet đọc thành công 3 dòng nhưng không ai nhận
 * được thư.
 *
 * @param {Record<string, unknown>|null|undefined} item một dòng dữ liệu từ output của node nguồn
 * @param {string} field tên cột cần lấy
 * @returns {unknown} giá trị, hoặc undefined nếu không có cột nào khớp
 */
export const resolveItemField = (item, field) => {
  if (!item || typeof item !== 'object') return undefined;
  const name = String(field ?? '').trim();
  if (!name) return undefined;
  if (Object.prototype.hasOwnProperty.call(item, name)) return item[name];
  const target = name.toLowerCase();
  const match = Object.keys(item).find((key) => String(key).trim().toLowerCase() === target);
  return match === undefined ? undefined : item[match];
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
