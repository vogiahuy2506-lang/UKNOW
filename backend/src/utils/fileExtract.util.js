/**
 * Extract nội dung từ file upload để gửi cho Gemini.
 *
 * - Image / PDF      → inlineData (Gemini đọc native)
 * - xlsx / xls / csv → text (dùng xlsx library)
 * - docx / doc       → text (dùng mammoth)
 * - Khác             → inlineData fallback
 */
import XLSX from 'xlsx';
import mammoth from 'mammoth';
import path from 'path';

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
]);
const PDF_MIME = 'application/pdf';
const EXCEL_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel',                                           // xls
  'text/csv',
  'application/csv',
]);
const DOCX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword',                                                        // doc
]);

function isExcelByName(name = '') {
  const ext = path.extname(name).toLowerCase();
  return ['.xlsx', '.xls', '.csv'].includes(ext);
}
function isDocxByName(name = '') {
  const ext = path.extname(name).toLowerCase();
  return ['.docx', '.doc'].includes(ext);
}

/**
 * @param {Buffer} buffer
 * @param {string} contentType  MIME type
 * @param {string} originalName Tên file gốc (dùng để fallback nếu MIME không rõ)
 * @returns {{ type: 'inline', mimeType: string, base64: string }
 *          | { type: 'text',   text: string }}
 */
export async function extractFileContent(buffer, contentType, originalName = '') {
  const mime = String(contentType || '').toLowerCase();

  // --- Excel / CSV ---
  if (EXCEL_MIMES.has(mime) || isExcelByName(originalName)) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const parts = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        return `[Sheet: ${sheetName}]\n${csv}`;
      });
      const text = parts.join('\n\n').trim();
      return {
        type: 'text',
        text: `[File: ${originalName}]\n${text || '(Không có dữ liệu)'}`,
      };
    } catch (e) {
      console.warn('[fileExtract] xlsx parse failed:', e.message);
      return { type: 'text', text: `[File: ${originalName}] (Không đọc được)` };
    }
  }

  // --- DOCX / DOC ---
  if (DOCX_MIMES.has(mime) || isDocxByName(originalName)) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value || '').trim();
      return {
        type: 'text',
        text: `[File: ${originalName}]\n${text || '(Không có nội dung)'}`,
      };
    } catch (e) {
      console.warn('[fileExtract] mammoth parse failed:', e.message);
      return { type: 'text', text: `[File: ${originalName}] (Không đọc được)` };
    }
  }

  // --- Image + PDF → Gemini đọc native ---
  if (IMAGE_MIMES.has(mime) || mime === PDF_MIME) {
    return { type: 'inline', mimeType: mime, base64: buffer.toString('base64') };
  }

  // --- Fallback: thử inline ---
  return { type: 'inline', mimeType: mime || 'application/octet-stream', base64: buffer.toString('base64') };
}
