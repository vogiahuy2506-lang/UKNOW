/**
 * Lọc cột dữ liệu node (đồng bộ logic với backend `dataColumnSelection.util.js`).
 * Dùng cho preview Builder; luồng chạy thật xử lý trên server.
 */

const ALWAYS_KEEP_BY_KIND = {
  sheet: ['row_number'],
  interested: ['customerId', 'id'],
  landing: ['leadId', 'id'],
  courses_db: [],
};

/**
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
 * @param {unknown} items
 * @param {unknown} rawSelectedColumns
 * @param {'sheet'|'interested'|'landing'|'courses_db'} kind
 * @returns {{ items: object[], dataLoadMeta: object }}
 */
export function applyDataColumnSelectionToItems(items, rawSelectedColumns, kind = 'sheet') {
  const selected = normalizeDataSelectedColumns(rawSelectedColumns);
  const alwaysKeep = ALWAYS_KEEP_BY_KIND[kind] || [];
  const list = Array.isArray(items) ? items : [];

  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const byteLengthUtf8 = (str) => {
    if (textEncoder) return textEncoder.encode(str).length;
    return unescape(encodeURIComponent(str)).length;
  };

  if (selected.length === 0) {
    const json = JSON.stringify(list);
    const bytes = byteLengthUtf8(json);
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
    batchPayloadBytesIfAllColumnsUtf8 += byteLengthUtf8(fullJson);
    const picked = {};
    keepSet.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        picked[key] = row[key];
      }
    });
    batchPayloadBytesUtf8 += byteLengthUtf8(JSON.stringify(picked));
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
 * @param {unknown} items
 * @returns {number}
 */
export function measureJsonUtf8Bytes(items) {
  try {
    const json = JSON.stringify(items ?? []);
    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    if (textEncoder) return textEncoder.encode(json).length;
    return unescape(encodeURIComponent(json)).length;
  } catch {
    return 0;
  }
}

/**
 * Hiển thị bytes dạng KB/MB ngắn gọn.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatDataPayloadBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
