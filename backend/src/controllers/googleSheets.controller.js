import axios from 'axios';
import Papa from 'papaparse';
import { getReadSheetFetchTimeoutMs } from '../utils/readSheetConfig.util.js';
import { applyDataColumnSelectionToItems } from '../utils/dataColumnSelection.util.js';

function extractSpreadsheetId(sheetUrl) {
  if (!sheetUrl || typeof sheetUrl !== 'string') return null;
  const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

function buildCsvUrl(spreadsheetId, sheetName) {
  const safeName = sheetName && typeof sheetName === 'string' ? sheetName : 'Sheet1';
  // Public/anyone-with-link view sheets can be exported via gviz.
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    safeName
  )}`;
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decode JS double-quoted string literal content.
 *
 * @param {string} value
 * @returns {string}
 */
function decodeJsQuotedString(value = '') {
  try {
    return JSON.parse(`"${String(value || '').replace(/"/g, '\\"')}"`);
  } catch {
    return String(value || '');
  }
}

/**
 * Fetch worksheet names for a public Google Spreadsheet via htmlview.
 *
 * @param {string} spreadsheetId
 * @returns {Promise<string[]>}
 */
async function fetchWorksheetNames(spreadsheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;
  const response = await axios.get(url, {
    responseType: 'text',
    timeout: getReadSheetFetchTimeoutMs(),
    validateStatus: () => true,
  });
  if (response.status >= 400) return [];
  const html = String(response.data || '');
  const names = [];
  const regex = /items\.push\(\{name:\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = regex.exec(html))) {
    const decoded = decodeJsQuotedString(match[1]).trim();
    if (decoded) names.push(decoded);
  }
  return Array.from(new Set(names));
}

/**
 * Validate that provided sheetName exists in spreadsheet.
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<boolean>}
 */
async function validateSheetNameExists(spreadsheetId, sheetName) {
  const worksheetNames = await fetchWorksheetNames(spreadsheetId);
  if (!worksheetNames.length) return false;
  const normalizedTarget = String(sheetName || '').trim();
  return worksheetNames.includes(normalizedTarget);
}

class GoogleSheetsController {
  /**
   * Kiểm tra kết nối Google Sheet và trả về danh sách tên cột.
   * Sheet phải được chia sẻ quyền xem công khai (Anyone with the link).
   * @param {import('express').Request} req - body: { sheetUrl, sheetName?, headerRow? }
   * @param {import('express').Response} res
   */
  async check(req, res) {
    try {
      const { sheetUrl, sheetName = 'Sheet1', headerRow = 1 } = req.body || {};
      const normalizedSheetName = String(sheetName || 'Sheet1').trim() || 'Sheet1';

      if (!sheetUrl || typeof sheetUrl !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Thiếu sheetUrl',
        });
      }

      const spreadsheetId = extractSpreadsheetId(sheetUrl);
      if (!spreadsheetId) {
        return res.status(400).json({
          success: false,
          message: 'sheetUrl không hợp lệ (không tìm thấy spreadsheetId)',
        });
      }

      const headerRowNum = Math.max(1, toInt(headerRow, 1));
      const sheetNameExists = await validateSheetNameExists(spreadsheetId, normalizedSheetName);
      if (!sheetNameExists) {
        return res.status(400).json({
          success: false,
          message: 'sheetName không tồn tại trong file Google Sheet',
        });
      }
      const csvUrl = buildCsvUrl(spreadsheetId, normalizedSheetName);
      const response = await axios.get(csvUrl, {
        responseType: 'text',
        timeout: getReadSheetFetchTimeoutMs(),
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        return res.status(502).json({
          success: false,
          message: 'Không thể tải dữ liệu sheet (lỗi từ Google)',
          data: { status: response.status },
        });
      }
      const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
      const bodyText = typeof response.data === 'string' ? response.data : '';
      if (contentType.includes('text/html') || bodyText.trim().startsWith('<!DOCTYPE html')) {
        return res.status(400).json({
          success: false,
          message:
            'Không đọc được sheet. Hãy đảm bảo file được chia sẻ quyền xem (Anyone with the link) và sheetName đúng.',
        });
      }

      const parsed = Papa.parse(bodyText, {
        skipEmptyLines: true,
      });

      if (parsed.errors && parsed.errors.length) {
        return res.status(400).json({
          success: false,
          message: 'Không thể parse CSV từ Google Sheet',
          errors: parsed.errors.slice(0, 5),
        });
      }

      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      if (!rows.length) {
        return res.json({
          success: true,
          data: {
            columns: [],
            meta: {
              spreadsheetId,
              sheetName: normalizedSheetName,
              headerRow: headerRowNum,
              csvUrl,
            },
          },
        });
      }

      const headerIdx = Math.min(rows.length - 1, Math.max(0, headerRowNum - 1));
      const header = Array.isArray(rows[headerIdx]) ? rows[headerIdx] : [];
      const columns = header
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean);

      return res.json({
        success: true,
        data: {
          columns,
          meta: {
            spreadsheetId,
            sheetName: normalizedSheetName,
            headerRow: headerRowNum,
            csvUrl,
          },
        },
      });
    } catch (error) {
      console.error('GoogleSheets check error:', error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi kiểm tra dữ liệu sheet',
      });
    }
  }

  /**
   * Xem trước dữ liệu từ Google Sheet.
   * Tham số `limit` bị clamp an toàn (mặc định tối đa 20.000) để Builder có thể xem nhiều dòng; CSV vẫn tải đủ rồi cắt theo limit.
   *
   * @param {import('express').Request} req - body: { sheetUrl, sheetName?, headerRow?, dataStartRow?, limit?, dataSelectedColumns? }
   * @param {import('express').Response} res
   */
  async preview(req, res) {
    try {
      const {
        sheetUrl,
        sheetName = 'Sheet1',
        headerRow = 1,
        dataStartRow = 2,
        limit = 25,
        dataSelectedColumns,
      } = req.body || {};
      const normalizedSheetName = String(sheetName || 'Sheet1').trim() || 'Sheet1';

      if (!sheetUrl || typeof sheetUrl !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Thiếu sheetUrl',
        });
      }

      const spreadsheetId = extractSpreadsheetId(sheetUrl);
      if (!spreadsheetId) {
        return res.status(400).json({
          success: false,
          message: 'sheetUrl không hợp lệ (không tìm thấy spreadsheetId)',
        });
      }

      const headerRowNum = Math.max(1, toInt(headerRow, 1));
      const dataStartRowNum = Math.max(1, toInt(dataStartRow, 2));
      /** Trần số dòng preview — đồng bộ với `GOOGLE_SHEET_PREVIEW_SERVER_MAX` phía frontend Builder. */
      const PREVIEW_LIMIT_MAX = 20000;
      const limitNum = Math.min(PREVIEW_LIMIT_MAX, Math.max(1, toInt(limit, 25)));
      const sheetNameExists = await validateSheetNameExists(spreadsheetId, normalizedSheetName);
      if (!sheetNameExists) {
        return res.status(400).json({
          success: false,
          message: 'sheetName không tồn tại trong file Google Sheet',
        });
      }

      const csvUrl = buildCsvUrl(spreadsheetId, normalizedSheetName);
      const response = await axios.get(csvUrl, {
        responseType: 'text',
        timeout: getReadSheetFetchTimeoutMs(),
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        return res.status(502).json({
          success: false,
          message: 'Không thể tải dữ liệu sheet (lỗi từ Google)',
          data: { status: response.status },
        });
      }
      const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
      const bodyText = typeof response.data === 'string' ? response.data : '';
      if (contentType.includes('text/html') || bodyText.trim().startsWith('<!DOCTYPE html')) {
        return res.status(400).json({
          success: false,
          message:
            'Không đọc được sheet. Hãy đảm bảo file được chia sẻ quyền xem (Anyone with the link) và sheetName đúng.',
        });
      }

      const parsed = Papa.parse(bodyText, {
        skipEmptyLines: true,
      });

      if (parsed.errors && parsed.errors.length) {
        return res.status(400).json({
          success: false,
          message: 'Không thể parse CSV từ Google Sheet',
          errors: parsed.errors.slice(0, 5),
        });
      }

      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      if (!rows.length) {
        return res.json({
          success: true,
          data: {
            items: [],
            meta: {
              spreadsheetId,
              sheetName: normalizedSheetName,
              csvUrl,
              fetched: 0,
            },
          },
        });
      }

      const headerIdx = Math.min(rows.length - 1, Math.max(0, headerRowNum - 1));
      const header = Array.isArray(rows[headerIdx]) ? rows[headerIdx] : [];
      const namedHeaderColumns = header
        .map((cell) => String(cell ?? '').trim())
        .filter(Boolean);
      const namedHeaderIndices = [];
      for (let c = 0; c < header.length; c += 1) {
        const key = String(header[c] ?? '').trim();
        if (key) namedHeaderIndices.push(c);
      }

      const startIdx = Math.min(rows.length, Math.max(dataStartRowNum - 1, headerIdx + 1));

      const items = [];
      for (let i = startIdx; i < rows.length && items.length < limitNum; i += 1) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const obj = { row_number: i + 1 };
        for (const c of namedHeaderIndices) {
          const key = String(header[c] ?? '').trim();
          obj[key] = row[c] ?? '';
        }
        items.push(obj);
      }

      const { items: filteredItems, dataLoadMeta } = applyDataColumnSelectionToItems(
        items,
        dataSelectedColumns,
        'sheet'
      );

      return res.json({
        success: true,
        data: {
          items: filteredItems,
          meta: {
            spreadsheetId,
            sheetName: normalizedSheetName,
            headerRow: headerRowNum,
            dataStartRow: dataStartRowNum,
            csvUrl,
            fetched: filteredItems.length,
            columns: namedHeaderColumns,
            dataLoadMeta,
          },
        },
      });
    } catch (error) {
      console.error('GoogleSheets preview error:', error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi đọc dữ liệu sheet',
      });
    }
  }
}

export default new GoogleSheetsController();

