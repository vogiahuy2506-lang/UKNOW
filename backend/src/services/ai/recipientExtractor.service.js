import module from 'module';
import path from 'path';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients } from '../../utils/manualRecipients.util.js';

const require = module.createRequire(import.meta.url);
const XLSX = require('xlsx');
const Papa = require('papaparse');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?:\+?84|0)\d{9,10}$/;

/**
 * Số dòng bị loại được kể tên cho người dùng. Chỉ cần vài ví dụ để họ nhận ra kiểu lỗi rồi tự
 * soát tệp — liệt kê hết một tệp 5.000 dòng thì không ai đọc, mà payload lại phình.
 */
const MAX_SKIPPED_SAMPLES = 5;
/** Cắt bớt giá trị lỗi trước khi trả về — ô trong bảng tính có thể dài tuỳ ý. */
const MAX_SKIPPED_VALUE_LEN = 120;
import {
  foldDiacritics,
  isEmailHeader,
  isPhoneHeader,
  isNameHeader,
} from '../../utils/columnHeaderMatch.util.js';

export function extractRecipientsFromBuffer(buffer, originalName = '', contentType = '') {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error('Tệp tải lên rỗng hoặc không hợp lệ.');
    error.code = 'INVALID_FILE_BUFFER';
    error.statusCode = 400;
    throw error;
  }

  const ext = path.extname(originalName || '').toLowerCase();
  const mime = String(contentType || '').toLowerCase();

  let rawRows = [];

  try {
    if (ext === '.csv' || mime === 'text/csv') {
      const csvStr = buffer.toString('utf-8');
      const parsed = Papa.parse(csvStr, { skipEmptyLines: true });
      rawRows = Array.isArray(parsed.data) ? parsed.data : [];
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        const error = new Error('Không tìm thấy trang tính trong file Excel.');
        error.code = 'EMPTY_SPREADSHEET';
        error.statusCode = 400;
        throw error;
      }
      const sheet = workbook.Sheets[firstSheetName];
      rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    }
  } catch (err) {
    if (err.statusCode) throw err;
    const error = new Error(`Không thể giải nén bảng tính: ${err.message}`);
    error.code = 'SPREADSHEET_PARSE_ERROR';
    error.statusCode = 400;
    throw error;
  }

  // Filter completely empty rows.
  // Giữ kèm số dòng GỐC: sau khi lọc dòng trống, chỉ số trong mảng không còn khớp số dòng người
  // dùng nhìn thấy trong Excel nữa — mà báo sai số dòng còn tệ hơn không báo.
  const rows = [];
  const rowNumbers = [];
  rawRows.forEach((row, idx) => {
    if (Array.isArray(row) && row.some((cell) => String(cell || '').trim().length > 0)) {
      rows.push(row);
      rowNumbers.push(idx + 1); // 1-based, khớp thanh số dòng của Excel/Google Sheet
    }
  });
  if (rows.length === 0) {
    const error = new Error('Bảng tính không có dữ liệu.');
    error.code = 'EMPTY_SPREADSHEET_DATA';
    error.statusCode = 400;
    throw error;
  }

  // Detect header row in top 5 rows
  let headerRowIndex = -1;
  let emailCol = -1;
  let phoneCol = -1;
  let nameCol = -1;

  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '');
      if (emailCol === -1 && isEmailHeader(cellVal)) {
        emailCol = c;
        headerRowIndex = r;
      }
      if (phoneCol === -1 && isPhoneHeader(cellVal)) {
        phoneCol = c;
        headerRowIndex = r;
      }
      if (nameCol === -1 && isNameHeader(cellVal)) {
        nameCol = c;
        headerRowIndex = r;
      }
    }
    if (headerRowIndex >= 0) break;
  }

  const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;
  const dataRows = rows.slice(startRow);
  const dataRowNumbers = rowNumbers.slice(startRow);

  const emailSet = new Set();
  const phoneSet = new Set();
  const sampleRows = [];
  const skippedSamples = [];
  let skipped = 0;

  dataRows.forEach((row, rowIdx) => {
    let emailFound = null;
    let phoneFound = null;
    let nameFound = null;

    if (emailCol >= 0 && row[emailCol]) {
      const val = String(row[emailCol] || '').trim().toLowerCase();
      if (EMAIL_RE.test(val)) emailFound = val;
    }
    if (phoneCol >= 0 && row[phoneCol]) {
      const rawPhone = String(row[phoneCol] || '').replace(/[\s().-]/g, '');
      if (PHONE_RE.test(rawPhone)) phoneFound = rawPhone;
    }
    if (nameCol >= 0 && row[nameCol]) {
      nameFound = String(row[nameCol] || '').trim();
    }

    // Fallback: if columns were not recognized by header, scan all cells in the row
    if (emailCol === -1 && phoneCol === -1) {
      row.forEach((cell) => {
        const str = String(cell || '').trim();
        const lower = str.toLowerCase();
        const rawPhone = str.replace(/[\s().-]/g, '');
        if (!emailFound && EMAIL_RE.test(lower)) {
          emailFound = lower;
        } else if (!phoneFound && PHONE_RE.test(rawPhone)) {
          phoneFound = rawPhone;
        } else if (!nameFound && str.length > 1 && str.length < 100 && !/\d{5,}/.test(str)) {
          nameFound = str;
        }
      });
    }

    if (emailFound) emailSet.add(emailFound);
    if (phoneFound) phoneSet.add(phoneFound);

    if (emailFound || phoneFound) {
      if (sampleRows.length < 5) {
        sampleRows.push({
          name: nameFound || undefined,
          email: emailFound || undefined,
          phone: phoneFound || undefined,
        });
      }
    } else {
      skipped += 1;
      // Kể tên vài dòng bị loại kèm LÝ DO. Trước đây chỉ đếm rồi thôi, nên một ô gõ nhầm
      // ('a@gmail,com' thay vì 'a@gmail.com') làm mất người nhận trong im lặng — người dùng
      // tưởng bộ đọc tệp hỏng. Bug thật 25/08/2026.
      if (skippedSamples.length < MAX_SKIPPED_SAMPLES) {
        const rawEmail = emailCol >= 0 ? String(row[emailCol] || '').trim() : '';
        const rawPhone = phoneCol >= 0 ? String(row[phoneCol] || '').trim() : '';
        let reason = 'no_contact';
        let value = null;
        if (rawEmail) {
          reason = 'email_invalid';
          value = rawEmail.slice(0, MAX_SKIPPED_VALUE_LEN);
        } else if (rawPhone) {
          reason = 'phone_invalid';
          value = rawPhone.slice(0, MAX_SKIPPED_VALUE_LEN);
        }
        skippedSamples.push({ row: dataRowNumbers[rowIdx] ?? null, value, reason });
      }
    }
  });

  const detectedHeaderRow = headerRowIndex >= 0 ? rows[headerRowIndex] : (rows.length > 0 ? rows[0] : []);
  const headers = Array.isArray(detectedHeaderRow)
    ? detectedHeaderRow.map((c) => String(c || '').trim()).filter(Boolean)
    : [];

  const emails = [...emailSet];
  const phones = [...phoneSet];
  const totalCount = emails.length + phones.length;

  if (totalCount === 0) {
    const error = new Error('Không tìm thấy địa chỉ email hoặc số điện thoại hợp lệ nào trong tệp.');
    error.code = 'NO_RECIPIENTS_FOUND';
    error.statusCode = 400;
    error.headers = headers;
    throw error;
  }

  if (totalCount > MAX_AI_MANUAL_RECIPIENTS) {
    const error = new Error(`Tệp có ${totalCount.toLocaleString('vi-VN')} người nhận, vượt quá giới hạn tối đa ${MAX_AI_MANUAL_RECIPIENTS.toLocaleString('vi-VN')} người mỗi chiến dịch.`);
    error.code = 'RECIPIENTS_LIMIT_EXCEEDED';
    error.statusCode = 400;
    error.totalCount = totalCount;
    error.limit = MAX_AI_MANUAL_RECIPIENTS;
    error.headers = headers;
    throw error;
  }

  return {
    emails,
    phones,
    rowCount: totalCount,
    headers,
    detectedColumns: {
      email: emailCol >= 0 || emails.length > 0,
      phone: phoneCol >= 0 || phones.length > 0,
      name: nameCol >= 0,
    },
    skipped,
    skippedSamples,
    sampleRows,
  };
}

export async function extractRecipientsFromGoogleSheet(sheetUrl, sheetName = '') {
  if (!sheetUrl || typeof sheetUrl !== 'string') {
    const error = new Error('Đường dẫn Google Sheet không hợp lệ hoặc bị thiếu.');
    error.code = 'INVALID_SHEET_URL';
    error.statusCode = 400;
    throw error;
  }

  const match = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    const error = new Error('Đường dẫn Google Sheet không hợp lệ (không tìm thấy spreadsheet ID).');
    error.code = 'INVALID_SPREADSHEET_ID';
    error.statusCode = 400;
    throw error;
  }

  const spreadsheetId = match[1];
  const safeName = sheetName && typeof sheetName === 'string' ? sheetName.trim() : '';
  const sheetParam = safeName ? `&sheet=${encodeURIComponent(safeName)}` : '';
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${sheetParam}`;

  const axios = (await import('axios')).default;
  const response = await axios.get(csvUrl, {
    responseType: 'text',
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status >= 400) {
    const error = new Error('Không thể tải dữ liệu từ Google Sheet (lỗi từ Google). Vui lòng kiểm tra lại quyền truy cập.');
    error.code = 'SHEET_FETCH_FAILED';
    error.statusCode = 502;
    throw error;
  }

  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  const bodyText = typeof response.data === 'string' ? response.data : '';
  const isHtml = contentType.includes('text/html') || bodyText.trim().startsWith('<!DOCTYPE html');
  if (isHtml) {
    const error = new Error('Không đọc được Google Sheet. Hãy đảm bảo file đã được chia sẻ quyền xem cho "Bất kỳ ai có đường liên kết" (Anyone with the link) và tên tab chính xác.');
    error.code = 'SHEET_NOT_PUBLIC';
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(bodyText, 'utf-8');
  return extractRecipientsFromBuffer(buffer, 'google_sheet.csv', 'text/csv');
}

export default {
  extractRecipientsFromBuffer,
  extractRecipientsFromGoogleSheet,
};
