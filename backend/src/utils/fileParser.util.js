import module from 'module';
import path from 'path';

const require = module.createRequire(import.meta.url);
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');
const Papa = require('papaparse');

/**
 * Extract text from different file types based on originalName and contentType.
 * 
 * @param {Buffer} buffer 
 * @param {string} originalName 
 * @param {string} contentType 
 * @returns {Promise<string>} Extracted text content
 */
export async function extractTextFromBuffer(buffer, originalName, contentType = '') {
  const ext = path.extname(originalName || '').toLowerCase();
  const mime = String(contentType || '').toLowerCase();

  // 1. PDF Documents
  if (ext === '.pdf' || mime === 'application/pdf') {
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (err) {
      console.error('[FileParser] PDF parse error:', err);
      throw new Error(`Không thể giải nén file PDF: ${err.message}`);
    }
  }

  // 2. Word Documents (.docx)
  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (err) {
      console.error('[FileParser] Word parse error:', err);
      throw new Error(`Không thể giải nén file Word (.docx): ${err.message}`);
    }
  }

  // 3. Excel Spreadsheets (.xlsx)
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

  // 4. CSV Files
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

  // 5. Plain Text, HTML, JSON, JS, etc.
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

  // Default: Fallback to UTF-8
  try {
    return buffer.toString('utf-8');
  } catch {
    return '';
  }
}
