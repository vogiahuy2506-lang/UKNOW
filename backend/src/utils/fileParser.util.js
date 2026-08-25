import module from 'module';
import path from 'path';

const require = module.createRequire(import.meta.url);
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const Papa = require('papaparse');

const KNOWN_BINARY_EXTENSIONS = new Set([
  '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx', '.pdf',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bin', '.exe', '.dmg',
  '.iso', '.apk', '.jar', '.class', '.mp3', '.mp4', '.wav', '.avi',
  '.mov', '.mkv', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'
]);

/**
 * Extract text from different file types based on originalName and contentType.
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} contentType
 * @param {{ max?: number }} [options] - PDF: `max` pages (0 = all pages, default). Chat attachments pass max: 30.
 * @returns {Promise<string>} Extracted text content
 */
export async function extractTextFromBuffer(buffer, originalName, contentType = '', options = {}) {
  const ext = path.extname(originalName || '').toLowerCase();
  const mime = String(contentType || '').toLowerCase();
  const pdfMax = typeof options.max === 'number' ? options.max : 0;

  // 1. PDF Documents
  if (ext === '.pdf' || mime === 'application/pdf') {
    try {
      const data = await pdfParse(buffer, { max: pdfMax });
      return data.text || '';
    } catch (err) {
      console.error('[FileParser] PDF parse error:', err);
      throw new Error(`Không thể giải nén file PDF: ${err.message}`);
    }
  }

  // 2. Word Documents (.docx, .doc)
  if (
    ext === '.docx' || ext === '.doc' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return (result.value || '').trim();
    } catch (err) {
      console.error('[FileParser] Word parse error:', err);
      if (ext === '.doc' || mime === 'application/msword') {
        // Mammoth có thể không giải nén được file .doc nhị phân cũ; trả chuỗi rỗng thay vì ném rác
        return '';
      }
      throw new Error(`Không thể giải nén file Word (.docx): ${err.message}`);
    }
  }

  // 3. Excel Spreadsheets (.xls legacy format via SheetJS)
  if (ext === '.xls' || mime === 'application/vnd.ms-excel') {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const parts = workbook.SheetNames.map((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        return `--- Sheet: ${sheetName} ---\n${csv}`;
      });
      return parts.join('\n\n').trim();
    } catch (err) {
      console.error('[FileParser] Excel .xls parse error:', err);
      throw new Error(`Không thể giải nén file Excel (.xls): ${err.message}`);
    }
  }

  // 4. Excel Spreadsheets (.xlsx openxml format)
  if (ext === '.xlsx' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      let text = '';
      workbook.eachSheet((sheet) => {
        text += `--- Sheet: ${sheet.name} ---\n`;
        sheet.eachRow((row, rowNumber) => {
          const values = Array.isArray(row.values) 
            ? row.values.slice(1).map(v => {
                if (typeof v === 'object' && v !== null) {
                  return v.result || v.text || JSON.stringify(v);
                }
                return String(v ?? '');
              })
            : [];
          text += `Row ${rowNumber}: ${values.join(' | ')}\n`;
        });
        text += '\n';
      });
      return text;
    } catch (err) {
      console.error('[FileParser] Excel parse error:', err);
      throw new Error(`Không thể giải nén file Excel (.xlsx): ${err.message}`);
    }
  }

  // 5. CSV Files
  if (ext === '.csv' || mime === 'text/csv') {
    try {
      const csvStr = buffer.toString('utf-8');
      const parsed = Papa.parse(csvStr, { header: false, skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length > 0) {
        console.warn('[FileParser] CSV parse warnings:', parsed.errors);
      }
      return parsed.data.map(row => row.join(' | ')).join('\n');
    } catch (err) {
      console.error('[FileParser] CSV parse error:', err);
      throw new Error(`Không thể giải nén file CSV: ${err.message}`);
    }
  }

  // 6. Plain Text, HTML, JSON, JS, etc.
  if (
    ext === '.txt' || ext === '.json' || ext === '.html' || ext === '.xml' || ext === '.js' || ext === '.ts' ||
    mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript'
  ) {
    try {
      return buffer.toString('utf-8');
    } catch (err) {
      console.error('[FileParser] Plain text decode error:', err);
      return buffer.toString('binary');
    }
  }

  // Default: Fallback to UTF-8 only if not a known binary extension.
  // Unknown binary formats should NEVER emit binary garbage into AI prompts.
  if (KNOWN_BINARY_EXTENSIONS.has(ext)) {
    return '';
  }

  try {
    return buffer.toString('utf-8');
  } catch {
    return '';
  }
}
