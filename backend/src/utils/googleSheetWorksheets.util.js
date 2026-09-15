import axios from 'axios';
import { getReadSheetFetchTimeoutMs } from './readSheetConfig.util.js';

/**
 * Decode JS double-quoted string literal content.
 *
 * @param {string} value
 * @returns {string}
 */
export function decodeJsQuotedString(value = '') {
  try {
    // Đoạn capture từ regex ở fetchWorksheetNames chỉ gồm ký tự thường hoặc cặp escape
    // \X (nhờ luân phiên \\. trong regex) — dấu " trần không bao giờ lọt vào, nên KHÔNG được
    // escape lại dấu " ở đây (bản trước có .replace(/"/g, '\\"') làm hỏng tên tab có dấu "
    // đã escape sẵn: \" bị escape chồng thành \\" → JSON.parse cắt chuỗi giữa chừng).
    return JSON.parse(`"${String(value || '')}"`);
  } catch {
    return String(value || '');
  }
}

/**
 * Trích spreadsheetId từ URL Google Sheet.
 *
 * @param {string} sheetUrl
 * @returns {string|null}
 */
export function extractSpreadsheetId(sheetUrl) {
  if (!sheetUrl || typeof sheetUrl !== 'string') return null;
  const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch worksheet (tab) names for a public Google Spreadsheet via htmlview, in file order.
 *
 * @param {string} spreadsheetId
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ ok: boolean, names?: string[], reason?: string, status?: number }>}
 */
export async function fetchWorksheetNames(spreadsheetId, { timeoutMs } = {}) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
  const response = await axios.get(url, {
    responseType: 'text',
    timeout: timeoutMs ?? getReadSheetFetchTimeoutMs(),
    validateStatus: () => true,
  });
  if (response.status >= 400) {
    return { ok: false, reason: 'unreadable', status: response.status };
  }
  const html = String(response.data || '');
  const names = [];
  const regex = /items\.push\(\{name:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = regex.exec(html))) {
    const decoded = decodeJsQuotedString(match[1]).trim();
    if (decoded) names.push(decoded);
  }
  return { ok: true, names: Array.from(new Set(names)) };
}

/**
 * Lấy tên tab đầu tiên (theo đúng thứ tự trong file) của một Google Sheet công khai.
 * KHÔNG bao giờ throw — mọi lỗi mạng/timeout/không đọc được đều trả về `null` để nơi gọi
 * để trống `sheetName` như hành vi cũ, không chặn việc tạo chiến dịch.
 *
 * @param {string} sheetUrl
 * @param {{ timeoutMs?: number }} [options] mặc định 8s — ngắn hơn nhiều so với
 *   `READ_SHEET_FETCH_TIMEOUT_MS` (180s) dùng khi đọc dữ liệu thật, vì đây chỉ là gợi ý điền sẵn.
 * @returns {Promise<string|null>}
 */
export async function getFirstWorksheetName(sheetUrl, { timeoutMs = 8000 } = {}) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) return null;
  try {
    const res = await fetchWorksheetNames(spreadsheetId, { timeoutMs });
    if (!res.ok || !res.names || !res.names.length) return null;
    return res.names[0];
  } catch (error) {
    console.warn('[getFirstWorksheetName] Không lấy được tên tab đầu tiên:', sheetUrl, error.message);
    return null;
  }
}
