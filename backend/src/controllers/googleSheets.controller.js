import axios from 'axios';
import Papa from 'papaparse';
import { getReadSheetFetchTimeoutMs } from '../utils/readSheetConfig.util.js';
import { applyDataColumnSelectionToItems } from '../utils/dataColumnSelection.util.js';
import { extractSpreadsheetId, fetchWorksheetNames } from '../utils/googleSheetWorksheets.util.js';

function buildCsvUrl(spreadsheetId, sheetName) {
  const safeName = sheetName && typeof sheetName === 'string' ? sheetName.trim() : '';
  const sheetParam = safeName ? `&sheet=${encodeURIComponent(safeName)}` : '';
  // Public/anyone-with-link view sheets can be exported via gviz.
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}`;
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Validate that provided sheetName exists in spreadsheet.
 * When sheetName is empty, skips validation (gviz defaults to the first tab).
 *
 * @param {string} spreadsheetId
 * @param {string} sheetName
 * @returns {Promise<{ ok: boolean, reason?: 'not_found' | 'unreadable', names?: string[] }>}
 */
async function validateSheetNameExists(spreadsheetId, sheetName) {
  const normalizedTarget = String(sheetName || '').trim();
  if (!normalizedTarget) {
    return { ok: true };
  }
  const res = await fetchWorksheetNames(spreadsheetId);
  if (!res.ok) {
    return { ok: false, reason: 'unreadable' };
  }
  const worksheetNames = res.names || [];
  if (!worksheetNames.length) {
    return { ok: false, reason: 'unreadable' };
  }
  if (!worksheetNames.includes(normalizedTarget)) {
    return { ok: false, reason: 'not_found', names: worksheetNames };
  }
  return { ok: true };
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
      const { sheetUrl, sheetName = '', headerRow = 1 } = req.body || {};
      const normalizedSheetName = sheetName && typeof sheetName === 'string' ? sheetName.trim() : '';

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

      // Luôn lấy danh sách tab: vừa để kiểm tra sheetName người dùng gõ (nếu có), vừa để trả
      // `worksheetNames` cho Builder tự điền ô Tên Sheet khi đang trống. Không đọc được tab
      // KHÔNG chặn khi sheetName đang trống — gviz vẫn đọc được tab đầu qua CSV bình thường.
      const worksheetRes = await fetchWorksheetNames(spreadsheetId);
      const worksheetNames = worksheetRes.ok ? (worksheetRes.names || []) : [];

      if (normalizedSheetName) {
        if (!worksheetRes.ok || !worksheetNames.length) {
          return res.status(400).json({
            success: false,
            message: 'Không đọc được file. Kiểm tra lại link, và đảm bảo đã chia sẻ quyền xem cho "Bất kỳ ai có đường liên kết".',
          });
        }
        if (!worksheetNames.includes(normalizedSheetName)) {
          return res.status(400).json({
            success: false,
            message: `Không tìm thấy tab "${normalizedSheetName}" trong file. File này có: ${worksheetNames.join(', ')}`,
          });
        }
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
            worksheetNames,
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
          worksheetNames,
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
        sheetName = '',
        headerRow = 1,
        dataStartRow = 2,
        limit = 25,
        dataSelectedColumns,
      } = req.body || {};
      const normalizedSheetName = sheetName && typeof sheetName === 'string' ? sheetName.trim() : '';

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
      const validation = await validateSheetNameExists(spreadsheetId, normalizedSheetName);
      if (!validation.ok) {
        if (validation.reason === 'not_found') {
          const availableMsg = validation.names && validation.names.length
            ? ` File này có: ${validation.names.join(', ')}`
            : '';
          return res.status(400).json({
            success: false,
            message: `Không tìm thấy tab "${normalizedSheetName}" trong file. ${availableMsg}`.trim(),
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Không đọc được file. Kiểm tra lại link, và đảm bảo đã chia sẻ quyền xem cho "Bất kỳ ai có đường liên kết".',
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

