/**
 * Extract text content from various file formats
 */

/**
 * Ghi token của lời gọi Gemini đọc chữ (OCR) khi nạp tài liệu: ảnh, hoặc PDF không trích được chữ. Prompt có cả ảnh/PDF
 * nên nặng — bản cũ bỏ `result.usage` nên khoản này Google tính mà trang Chi phí AI không thấy (audit_ai.md C-4).
 *
 * Chỉ GHI TOKEN cho admin, KHÔNG trừ credit: chính sách credit — nạp tài liệu vào KB là lập chỉ mục, không sinh câu trả
 * lời cho khách (project_ai_credit_policy). `record` không ném lỗi nên OCR không bao giờ hỏng vì sổ.
 */
async function recordOcrUsage(userId, result, requestedModel) {
  const { default: aiUsageMeter } = await import('../services/ai/aiUsageMeter.service.js');
  await aiUsageMeter.record(userId, result?.usage, {
    feature: 'kb_ocr',
    model: result?.modelUsed || requestedModel,
  });
}

/**
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {{ userId?: number|string|null }} [options] userId = chủ chatbot/tài liệu — người mà chi phí OCR được gán cho
 */
export async function extractTextFromBuffer(buffer, filename, { userId = null } = {}) {
  const ext = filename.toLowerCase().split('.').pop();

  try {
    switch (ext) {
      case 'txt':
      case 'md':
      case 'csv':
        return buffer.toString('utf-8');

      case 'json':
        const json = JSON.parse(buffer.toString('utf-8'));
        return typeof json === 'string' ? json : JSON.stringify(json, null, 2);

      case 'html':
      case 'htm':
        return extractTextFromHtml(buffer.toString('utf-8'));

      case 'pdf':
        return await extractTextFromPdf(buffer, { userId });

      case 'doc':
      case 'docx':
        return await extractTextFromDocx(buffer);

      case 'pptx':
        return await extractTextFromPptx(buffer);

      case 'xlsx':
      case 'xls':
        return await extractTextFromExcel(buffer);

      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
        return await extractTextFromImage(buffer, ext, { userId });

      default:
        // Try to read as text
        return buffer.toString('utf-8');
    }
  } catch (e) {
    console.error('[FileExtractor] Error extracting text:', e.message);
    return '';
  }
}

function extractTextFromHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Preserve links by converting <a href="url">text</a> to "text (url)"
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function extractTextFromPdf(buffer, { userId = null } = {}) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    // pdf.js 1.10/2.0 (đi kèm pdf-parse) đọc SAI khi nhận Node Buffer: báo "bad XRef entry" ở 2 lượt gọi đầu của mỗi tiến
    // trình (đo 20/09/2026), PDF có chữ bị đẩy sang OCR Gemini cả tệp (tốn tiền, đầu ra cắt ở 16.384 token). Đưa VIEW
    // Uint8Array (không sao chép) như `fileParser.util.js`; đừng đổi lại thành Buffer.
    const bytes = Buffer.isBuffer(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : buffer;
    const data = await pdfParse(bytes);
    if (data.text && data.text.trim().length > 50) {
      return data.text.trim();
    }
  } catch (err) {
    console.error('[FileExtractor] PDF parse error:', err.message);
  }

  // Fallback to Gemini for scanned PDFs or exported presentations (like PowerPoint)
  try {
    const { generateGeminiContent } = await import('./geminiClient.util.js');
    const { resolveAllowedModel } = await import('../services/ai/aiModelPolicy.service.js');
    const base64Data = buffer.toString('base64');
    const parts = [
      {
        text: 'Extract all readable text from this document exactly as it appears. If there is no text but there is a clear diagram, chart, or visual data, describe it concisely. If it is just a decorative document with no useful text or data, output "NO_RELEVANT_TEXT_FOUND". Do not add any conversational filler.'
      },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Data
        }
      }
    ];

    // Model do super admin chọn, KHÔNG ghim tên. Bản cũ ghim cứng 'gemini-2.5-flash' từ 24/08 (không
    // ghi lý do) nên đường này không nghe theo lựa chọn của admin, và sẽ gãy riêng một mình khi Google
    // khai tử 2.5-flash như đã làm với 2.0-flash hôm 10/08. Đã thử thật trên production 24/09:
    // model hệ thống (gemini-3.5-flash) đọc đúng PDF gửi kèm kiểu inlineData này.
    const model = await resolveAllowedModel(null);
    const result = await generateGeminiContent({
      parts,
      model,
      temperature: 0.1
    });
    // Ghi TRƯỚC khi đọc kết quả: kể cả khi bài chỉ ra "NO_RELEVANT_TEXT_FOUND" thì Google vẫn đã tính tiền lượt này.
    await recordOcrUsage(userId, result, model);

    if (result?.text?.includes('NO_RELEVANT_TEXT_FOUND')) {
      return '';
    }
    return result?.text?.trim() || '';
  } catch (err) {
    console.error('[FileExtractor] Error extracting text from PDF via Gemini:', err.message);
    return '';
  }
}

/** Giải mã thực thể XML (`&amp;`, `&#7879;`, `&#x1EC7;`…) — đi SAU khi đã gỡ thẻ, để `&lt;b&gt;` không bị coi là thẻ. */
function decodeXmlEntities(text) {
  const fromCodePoint = (code) => {
    try {
      return String.fromCodePoint(code);
    } catch {
      return ' ';
    }
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Trích chữ từ `word/document.xml` của DOCX, GIỮ ranh giới đoạn.
 *
 * Bản cũ dùng chung `extractTextFromHtml` (`.replace(/\s+/g, ' ')`) nên MỌI xuống dòng bị xoá — cả tệp DOCX thành một dòng,
 * một đoạn văn khổng lồ (A P0-3). Và thay mỗi thẻ bằng khoảng trắng nên từ bị chia nhiều "run" (`<w:r>` Xin ch</w:r><w:r>ào`)
 * thành "Xin ch ào". Nay: kết thúc đoạn `</w:p>`/`<w:br/>` → xuống dòng, mỗi hàng bảng → một dòng (ô cách nhau " | "), `<w:tab/>`
 * → khoảng trắng, gỡ thẻ KHÔNG chèn khoảng trắng; bỏ mã trường (`instrText`), chữ đã xoá (`delText`) và bản dự phòng `mc:Fallback`
 * (trùng nội dung hộp chữ).
 */
export function extractTextFromDocxXml(xml) {
  const text = String(xml || '')
    .replace(/<mc:Fallback[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<w:(instrText|delText)\b[^>]*>[\s\S]*?<\/w:\1>/g, '')
    // Bảng giá/danh mục: MỘT hàng bảng = MỘT dòng, các ô cách nhau " | " (không để mỗi ô một dòng làm mất quan hệ tên – giá).
    .replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => row
      .replace(/<w:(?:br|cr)\b[^>]*\/>/g, ' ')
      .replace(/<\/w:p>/g, ' ')
      .replace(/<\/w:tc>/g, ' | ')
      .replace(/<\/w:tr>/g, '\n'))
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:(?:br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeXmlEntities(text)
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim().replace(/\s*\|$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractTextFromDocx(buffer) {
  // Basic DOCX extraction using JSZip
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const content = await zip.file('word/document.xml')?.async('string');
    if (!content) return '';

    return extractTextFromDocxXml(content);
  } catch (e) {
    console.error('[FileExtractor] DOCX error:', e.message);
    return '';
  }
}

/** Số hàng Excel gộp thành một khối (cách nhau dòng trống) để chunker có ranh giới tự nhiên (A P0-3: bản cũ nối `\n` đơn → cả sổ 1 đoạn). */
export const XLSX_ROWS_PER_BLOCK = 25;

async function extractTextFromExcel(buffer) {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const blocks = [];
    workbook.eachSheet((sheet) => {
      let lines = [`--- Sheet: ${sheet.name} ---`];
      let rowsInBlock = 0;
      sheet.eachRow((row, rowNumber) => {
        const values = Array.isArray(row.values) ? row.values : Object.values(row);
        const rowText = values
          .slice(1) // Skip first empty cell
          .map(v => (v != null ? String(v) : ''))
          .filter(v => v.trim())
          .join(' | ');
        if (!rowText.trim()) return;
        lines.push(`Row ${rowNumber}: ${rowText}`);
        rowsInBlock += 1;
        if (rowsInBlock >= XLSX_ROWS_PER_BLOCK) {
          blocks.push(lines.join('\n'));
          lines = [];
          rowsInBlock = 0;
        }
      });
      if (lines.length > 0) blocks.push(lines.join('\n'));
    });
    return blocks.join('\n\n').trim();
  } catch (e) {
    console.error('[FileExtractor] Excel error:', e.message);
    return '';
  }
}

async function extractTextFromImage(buffer, ext, { userId = null } = {}) {
  try {
    const { generateGeminiContent } = await import('./geminiClient.util.js');
    const { resolveAllowedModel } = await import('../services/ai/aiModelPolicy.service.js');
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';

    const base64Data = buffer.toString('base64');
    const parts = [
      {
        text: 'Extract all readable text from this image exactly as it appears. If there is no text but there is a clear diagram, chart, or visual data, describe it concisely. If it is just a decorative image with no useful text or data, output "NO_RELEVANT_TEXT_FOUND". Do not add any conversational filler.'
      },
      {
        inlineData: {
          mimeType,
          data: base64Data
        }
      }
    ];

    // Cùng lý do với extractTextFromPdf: theo model admin chọn, không ghim tên. Thử thật 24/09:
    // model hệ thống nhận ảnh gửi kèm kiểu inlineData.
    const model = await resolveAllowedModel(null);
    const result = await generateGeminiContent({
      parts,
      model,
      temperature: 0.1
    });
    // Ghi TRƯỚC khi đọc kết quả (xem extractTextFromPdf).
    await recordOcrUsage(userId, result, model);

    if (result?.text?.includes('NO_RELEVANT_TEXT_FOUND')) {
      return '';
    }
    return result?.text || '';
  } catch (err) {
    console.error('[FileExtractor] Error extracting text from image:', err.message);
    return '';
  }
}

async function extractTextFromPptx(buffer) {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    let text = '';
    // Find all slide XML files
    const slideFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'));
    
    // Sort slides by number so they are in order
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    for (const filename of slideFiles) {
      const content = await zip.file(filename).async('string');
      // Extract text from <a:t> tags
      const matches = content.match(/<a:t>(.*?)<\/a:t>/g);
      if (matches) {
        // Remove the xml tags, just keep the text
        const slideText = matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
        if (slideText.trim()) {
          text += `--- Slide ${parseInt(filename.replace(/\D/g, ''), 10)} ---\n${slideText}\n\n`;
        }
      }
    }
    
    return text.trim();
  } catch (e) {
    console.error('[FileExtractor] PPTX error:', e.message);
    return '';
  }
}
