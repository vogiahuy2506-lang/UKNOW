import module from 'module';
import path from 'path';
import { MAX_AI_MANUAL_RECIPIENTS, validateManualRecipients } from '../../utils/manualRecipients.util.js';

const require = module.createRequire(import.meta.url);
const XLSX = require('xlsx');
const Papa = require('papaparse');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?:\+?84|0)\d{9,10}$/;

function foldDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (m) => (m === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .trim();
}

function isEmailHeader(h) {
  const norm = foldDiacritics(h);
  return /^(email|e-mail|thu|mail|dia chi email|email address)$/i.test(norm)
    || norm.includes('email')
    || norm === 'mail';
}

function isPhoneHeader(h) {
  const norm = foldDiacritics(h);
  return /^(phone|sdt|dien thoai|so dt|so dien thoai|mobile|tel|phone number|telephone)$/i.test(norm)
    || norm.includes('sdt')
    || norm.includes('dien thoai')
    || norm.includes('phone');
}

function isNameHeader(h) {
  const norm = foldDiacritics(h);
  return /^(name|ten|ho ten|ho va ten|fullname|full name|customer name|ten khach hang)$/i.test(norm)
    || norm.includes('ho ten')
    || norm.includes('fullname');
}

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

  // Filter completely empty rows
  const rows = rawRows.filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim().length > 0));
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

  const emailSet = new Set();
  const phoneSet = new Set();
  const sampleRows = [];
  let skipped = 0;

  dataRows.forEach((row) => {
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
    }
  });

  const emails = [...emailSet];
  const phones = [...phoneSet];
  const totalCount = emails.length + phones.length;

  if (totalCount === 0) {
    const error = new Error('Không tìm thấy địa chỉ email hoặc số điện thoại hợp lệ nào trong tệp.');
    error.code = 'NO_RECIPIENTS_FOUND';
    error.statusCode = 400;
    throw error;
  }

  if (totalCount > MAX_AI_MANUAL_RECIPIENTS) {
    const error = new Error(`Tệp có ${totalCount.toLocaleString('vi-VN')} người nhận, vượt quá giới hạn tối đa ${MAX_AI_MANUAL_RECIPIENTS.toLocaleString('vi-VN')} người mỗi chiến dịch.`);
    error.code = 'RECIPIENTS_LIMIT_EXCEEDED';
    error.statusCode = 400;
    error.totalCount = totalCount;
    error.limit = MAX_AI_MANUAL_RECIPIENTS;
    throw error;
  }

  return {
    emails,
    phones,
    rowCount: totalCount,
    detectedColumns: {
      email: emailCol >= 0 || emails.length > 0,
      phone: phoneCol >= 0 || phones.length > 0,
      name: nameCol >= 0,
    },
    skipped,
    sampleRows,
  };
}

export default {
  extractRecipientsFromBuffer,
};
