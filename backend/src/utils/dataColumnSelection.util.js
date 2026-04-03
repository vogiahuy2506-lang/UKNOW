import { Buffer } from 'node:buffer';

/**
 * Các trường luôn giữ lại theo loại node để downstream (gộp khóa, log, định danh) không bị gãy.
 * Khi `dataSelectedColumns` rỗng = giữ nguyên toàn bộ trường như trước (tương thích ngược).
 */
const ALWAYS_KEEP_BY_KIND = {
  sheet: ['row_number'],
  interested: ['customerId', 'id'],
  landing: ['leadId', 'id'],
  courses_db: [],
};

/**
 * Chuẩn hóa danh sách tên cột người dùng chọn (bỏ rỗng, trùng).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeDataSelectedColumns(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  raw.forEach((c) => {
    const s = String(c ?? '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

/**
 * Lọc từng dòng object chỉ còn các khóa cần thiết; đo UTF-8 bytes JSON từng dòng để ước lượng tiết kiệm bộ nhớ.
 *
 * Luồng hoạt động:
 * 1. Nếu không chọn cột → trả nguyên mảng, meta bytes = stringify toàn bộ danh sách một lần.
 * 2. Nếu có chọn → với mỗi object: đo size bản đầy đủ, tạo object chỉ gồm alwaysKeep ∪ selected, đo size sau lọc.
 * 3. Cộng dồn bytes để có tổng payload «như đủ cột» vs «đã lọc» trên tập items hiện tại.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {unknown} rawSelectedColumns config.dataSelectedColumns
 * @param {'sheet'|'interested'|'landing'|'courses_db'} kind
 * @returns {{ items: Array<Record<string, unknown>>, dataLoadMeta: object }}
 */
export function applyDataColumnSelectionToItems(items, rawSelectedColumns, kind = 'sheet') {
  const selected = normalizeDataSelectedColumns(rawSelectedColumns);
  const alwaysKeep = ALWAYS_KEEP_BY_KIND[kind] || [];
  const list = Array.isArray(items) ? items : [];

  if (selected.length === 0) {
    const json = JSON.stringify(list);
    const bytes = Buffer.byteLength(json, 'utf8');
    return {
      items: list,
      dataLoadMeta: {
        columnSelectionActive: false,
        selectedDataColumns: [],
        batchPayloadBytesUtf8: bytes,
        batchPayloadBytesIfAllColumnsUtf8: bytes,
        batchEstimatedSavingsBytes: 0,
        dataColumnSelectionKind: kind,
      },
    };
  }

  const keepSet = new Set([...alwaysKeep, ...selected]);
  let batchPayloadBytesIfAllColumnsUtf8 = 0;
  let batchPayloadBytesUtf8 = 0;
  const out = [];

  for (const row of list) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      out.push(row);
      continue;
    }
    const fullJson = JSON.stringify(row);
    batchPayloadBytesIfAllColumnsUtf8 += Buffer.byteLength(fullJson, 'utf8');
    const picked = {};
    keepSet.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        picked[key] = row[key];
      }
    });
    batchPayloadBytesUtf8 += Buffer.byteLength(JSON.stringify(picked), 'utf8');
    out.push(picked);
  }

  return {
    items: out,
    dataLoadMeta: {
      columnSelectionActive: true,
      selectedDataColumns: selected,
      batchPayloadBytesUtf8,
      batchPayloadBytesIfAllColumnsUtf8,
      batchEstimatedSavingsBytes: Math.max(0, batchPayloadBytesIfAllColumnsUtf8 - batchPayloadBytesUtf8),
      dataColumnSelectionKind: kind,
    },
  };
}

/**
 * Đo nhanh UTF-8 bytes của JSON.stringify(items) — dùng cho meta tổng sau merge continuous.
 *
 * @param {unknown} items
 * @returns {number}
 */
export function measureJsonUtf8Bytes(items) {
  try {
    return Buffer.byteLength(JSON.stringify(items ?? []), 'utf8');
  } catch {
    return 0;
  }
}
