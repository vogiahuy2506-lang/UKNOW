/**
 * Hằng số và helper cho giới hạn preview Google Sheet + cắt `items` trên log Builder.
 *
 * Lưu ý node `read_sheet`:
 * - Số dòng fetch preview phụ thuộc `config.builderSheetPreviewRowLimit` (ưu tiên) hoặc `logItemsMode` từ Builder (mặc định `100`).
 * - `cloneResultForBuilderLogDisplay` chỉ ảnh hưởng bản ghi log; `ctx` trong executor vẫn nhận `result` đầy đủ từ runner.
 */

/** Số dòng tối đa mặc định khi `logItemsMode === '100'` và khi cắt hiển thị log */
export const BUILDER_LOG_ITEMS_CAP = 100;

/**
 * Trần dòng preview — phải khớp backend `googleSheets.controller` (`PREVIEW_LIMIT_MAX`).
 * Khi `logItemsMode === 'all'` và node không ghi đè limit, dùng mức này để có thể xem tới hàng chục nghìn dòng.
 */
export const GOOGLE_SHEET_PREVIEW_SERVER_MAX = 20000;

/** @deprecated dùng `GOOGLE_SHEET_PREVIEW_SERVER_MAX`; giữ tên để import cũ không gãy */
export const BUILDER_SHEET_PREVIEW_LIMIT_FULL = GOOGLE_SHEET_PREVIEW_SERVER_MAX;

/**
 * Giới hạn preview Sheet khi chỉ có `logItemsMode` (không cấu hình limit trên node).
 *
 * @param {string} mode `'100'` | `'all'`
 * @returns {number}
 */
export function resolveBuilderSheetPreviewLimit(mode) {
  return mode === 'all' ? GOOGLE_SHEET_PREVIEW_SERVER_MAX : BUILDER_LOG_ITEMS_CAP;
}

/**
 * Quyết định `limit` gửi API preview Sheet: ưu tiên `config.builderSheetPreviewRowLimit`, sau đó `logItemsMode`.
 *
 * Luồng:
 * 1. Giá trị `all` — lấy trần server.
 * 2. Số dương — clamp theo trần server.
 * 3. Chuỗi rỗng / không set — `resolveBuilderSheetPreviewLimit(logItemsMode)`.
 *
 * @param {Record<string, unknown>} config `node.data.config` của read_sheet
 * @param {string} logItemsMode `'100'` | `'all'`
 * @returns {number}
 */
export function resolveSheetPreviewApiLimit(config, logItemsMode) {
  const raw = config?.builderSheetPreviewRowLimit;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const s = String(raw).trim().toLowerCase();
    if (s === 'all') {
      return GOOGLE_SHEET_PREVIEW_SERVER_MAX;
    }
    const n = Number.parseInt(s, 10);
    if (Number.isFinite(n) && n > 0) {
      return Math.min(n, GOOGLE_SHEET_PREVIEW_SERVER_MAX);
    }
  }
  return resolveBuilderSheetPreviewLimit(logItemsMode);
}

/**
 * Chế độ cắt log hiệu dụng: nếu node Sheet yêu cầu >100 dòng hoặc «all», không slice log xuống 100
 * khi `logItemsMode` đang `'100'`.
 *
 * @param {string} nodeType
 * @param {Record<string, unknown>|undefined} nodeConfig
 * @param {string} logItemsMode chế độ log Builder (`'100'` | `'all'`)
 * @returns {'100'|'all'}
 */
export function resolveEffectiveBuilderLogItemsMode(nodeType, nodeConfig, logItemsMode) {
  if (String(nodeType || '').trim() !== 'read_sheet') {
    return logItemsMode === 'all' ? 'all' : '100';
  }
  const raw = nodeConfig?.builderSheetPreviewRowLimit;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return logItemsMode === 'all' ? 'all' : '100';
  }
  const s = String(raw).trim().toLowerCase();
  if (s === 'all') return 'all';
  const n = Number.parseInt(s, 10);
  if (Number.isFinite(n) && n > BUILDER_LOG_ITEMS_CAP) return 'all';
  return logItemsMode === 'all' ? 'all' : '100';
}

/**
 * Sao chép kết quả node để ghi log: cắt `output.items` khi chế độ 100, không đổi bản gốc (ctx).
 *
 * Luồng:
 * 1. Nếu không có `output.items` mảng → trả nguyên bản (tham chiếu).
 * 2. Chế độ `all` → trả nguyên bản.
 * 3. Ngắn hơn hoặc bằng ngưỡng → trả nguyên bản.
 * 4. Ngược lại: shallow clone `result` + `output`, slice items, bổ sung meta hiển thị.
 *
 * @param {object|null|undefined} result kết quả từ `buildRunResultForNode`
 * @param {string} logItemsMode `'100'` | `'all'`
 * @returns {object|null|undefined}
 */
export function cloneResultForBuilderLogDisplay(result, logItemsMode) {
  if (!result || logItemsMode === 'all') return result;
  const out = result.output;
  if (!out || !Array.isArray(out.items)) return result;
  const fullLen = out.items.length;
  if (fullLen <= BUILDER_LOG_ITEMS_CAP) return result;
  const sliced = out.items.slice(0, BUILDER_LOG_ITEMS_CAP);
  const prevMeta = out.meta && typeof out.meta === 'object' ? out.meta : {};
  return {
    ...result,
    output: {
      ...out,
      items: sliced,
      meta: {
        ...prevMeta,
        builderLogTotalItems: fullLen,
        builderLogPreviewed: sliced.length,
        builderLogTruncated: true,
      },
    },
  };
}
