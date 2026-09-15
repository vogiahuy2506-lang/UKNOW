import { getNodeSubtype } from '../../utils/nodeSubtype.util.js';
import { extractSpreadsheetId, getFirstWorksheetName } from '../../utils/googleSheetWorksheets.util.js';

/**
 * Điền tên tab đầu tiên vào các node `read_sheet` đang có `sheetUrl` nhưng `sheetName` trống —
 * bám sát yêu cầu sếp 14/09: tự động nhận tên sheet đầu tiên trong file Excel để thêm vào node,
 * thay vì để trống như trước. Xem `_internal/PLAN_TU_NHAN_TEN_SHEET_DAU_TIEN_2026-09-15.md`.
 *
 * Node đã có `sheetName` (kể cả do người dùng gõ tay) KHÔNG bị đụng vào. Nhiều node cùng
 * `sheetUrl` chỉ gọi mạng một lần nhờ cache theo spreadsheetId trong một lượt gọi. Lỗi mạng /
 * sheet không công khai / không có tab nào → giữ nguyên `sheetName` trống như hành vi cũ,
 * KHÔNG chặn việc tạo chiến dịch.
 *
 * @param {Array<object>} nodes danh sách node của kịch bản (đã prepareScript)
 * @param {{ timeoutMs?: number }} [options] mặc định 8s (không dùng timeout 180s của bước đọc dữ liệu thật)
 * @returns {Promise<void>} sửa trực tiếp trên các object node trong `nodes`
 */
export async function fillReadSheetFirstTabNames(nodes, { timeoutMs } = {}) {
  if (!Array.isArray(nodes) || !nodes.length) return;

  const targets = nodes.filter((node) => {
    if (getNodeSubtype(node) !== 'read_sheet') return false;
    const config = node?.config || {};
    const sheetUrl = String(config.sheetUrl || '').trim();
    const sheetName = String(config.sheetName || '').trim();
    return Boolean(sheetUrl) && !sheetName;
  });
  if (!targets.length) return;

  /** Cache theo spreadsheetId để nhiều node cùng URL chỉ gọi mạng một lần. */
  const nameCache = new Map();

  for (const node of targets) {
    const sheetUrl = String(node.config.sheetUrl || '').trim();
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    const cacheKey = spreadsheetId || sheetUrl;

    if (!nameCache.has(cacheKey)) {
      // eslint-disable-next-line no-await-in-loop
      nameCache.set(cacheKey, await getFirstWorksheetName(sheetUrl, { timeoutMs }));
    }

    const firstTabName = nameCache.get(cacheKey);
    if (firstTabName) {
      node.config.sheetName = firstTabName;
      node.config.sheetNameSource = 'auto';
    }
  }
}
