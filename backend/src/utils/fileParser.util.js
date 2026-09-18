import module from 'module';
import path from 'path';

const require = module.createRequire(import.meta.url);
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const Papa = require('papaparse');
const JSZip = require('jszip');
const WordExtractor = require('word-extractor');

const KNOWN_BINARY_EXTENSIONS = new Set([
  '.xls', '.xlsx', '.doc', '.docx', '.ppt', '.pptx', '.pdf',
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bin', '.exe', '.dmg',
  '.iso', '.apk', '.jar', '.class', '.mp3', '.mp4', '.wav', '.avi',
  '.mov', '.mkv', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'
]);

/**
 * Trích xuất text thuần từ file buffer theo định dạng
 * @param {Buffer} buffer - File buffer
 * @param {string} originalName - Tên file gốc (để lấy extension)
 * @param {string} contentType - Mime type của file
 * @param {object} [options] - Tuỳ chọn thêm: { max: số trang PDF tối đa, 0 = không giới hạn }
 * @returns {Promise<string>} Text trích xuất được
 */
export async function extractTextFromBuffer(buffer, originalName, contentType, options = {}) {
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

  // 2. Word Documents (.doc legacy format via WordExtractor)
  // Đuôi thắng MIME: máy không cài Office hay khai .docx là 'application/msword' — đẩy tệp OpenXML
  // sang bộ đọc Word 97 sẽ hỏng, trong khi mammoth đọc được.
  if (ext === '.doc' || (ext !== '.docx' && mime === 'application/msword')) {
    try {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      return (doc.getBody() || '').trim();
    } catch (err) {
      console.error('[FileParser] Word .doc parse error:', err);
      throw new Error(`Không thể giải nén file Word (.doc): ${err.message}`);
    }
  }

  // 3. Word Documents (.docx openxml format via Mammoth + fallback JSZip cho text box/shapes)
  if (
    ext === '.docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      let text = (result.value || '').trim();
      if (!text) {
        // Fallback: nếu Mammoth không trích được chữ (chữ nằm trong Text Box <w:txbxContent> hoặc Shape)
        try {
          const zip = new JSZip();
          await zip.loadAsync(buffer);
          const docXmlFile = zip.file('word/document.xml');
          if (docXmlFile) {
            const docXml = await docXmlFile.async('string');
            const matches = docXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
            if (matches && matches.length > 0) {
              text = matches.map((m) => m.replace(/<\/?w:t[^>]*>/g, '')).join(' ').trim();
            }
          }
        } catch {
          // Bỏ qua lỗi fallback, trả text hiện tại
        }
      }
      return text;
    } catch (err) {
      console.error('[FileParser] Word parse error:', err);
      throw new Error(`Không thể giải nén file Word (.docx): ${err.message}`);
    }
  }

  // 3. PowerPoint Presentations (.pptx)
  if (
    ext === '.pptx' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    try {
      const zip = new JSZip();
      await zip.loadAsync(buffer);
      let text = '';
      const slideFiles = Object.keys(zip.files).filter((name) =>
        name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
      );
      slideFiles.sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
      for (const filename of slideFiles) {
        const content = await zip.file(filename).async('string');
        const matches = content.match(/<a:t>(.*?)<\/a:t>/g);
        if (matches) {
          const slideText = matches.map((m) => m.replace(/<\/?a:t>/g, '')).join(' ');
          if (slideText.trim()) {
            const slideNum = parseInt(filename.replace(/\D/g, ''), 10) || 0;
            text += `--- Slide ${slideNum} ---\n${slideText}\n\n`;
          }
        }
      }
      return text.trim();
    } catch (err) {
      console.error('[FileParser] PowerPoint parse error:', err);
      throw new Error(`Không thể giải nén file PowerPoint (.pptx): ${err.message}`);
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
