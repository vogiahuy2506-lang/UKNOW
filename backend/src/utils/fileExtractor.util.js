/**
 * Extract text content from various file formats
 */

/**
 * Đọc chữ bằng Gemini (OCR) cho ảnh và PDF quét — các trần dưới đây có lý do, đừng nới mà không đo lại (D-11).
 *
 *  - `OCR_MAX_OUTPUT_TOKENS`: bản cũ không đặt, rơi về mặc định 16.384 của lõi nên PDF dài bị cắt IM LẶNG tại đó mà tài liệu vẫn
 *    `ready` với nội dung cụt. Nay đặt tường minh và coi `finishReason === 'MAX_TOKENS'` là LỖI. Không nâng lên 32k/64k: sinh
 *    chừng đó token mất > 2 phút, vượt xa trần 100 giây của Cloudflare cho request upload.
 *  - `OCR_MAX_INPUT_BYTES`: tệp gửi kiểu inlineData (base64 phình thêm 1/3) nằm trong trần 20 MB cho cả yêu cầu của Gemini;
 *    quá mốc này Google trả 400 sau khi ta đã đọc cả tệp vào RAM và mã hoá.
 *  - `OCR_MAX_PDF_PAGES`: đầu ra 16k token chứa vừa chừng 15–30 trang chữ dày; PDF dài hơn nhiều chắc chắn bị cắt.
 */
export const OCR_MAX_OUTPUT_TOKENS = 16384;
export const OCR_MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const OCR_MAX_PDF_PAGES = 40;

export const OCR_ERROR_CODES = Object.freeze({
  TOO_LARGE: 'OCR_TOO_LARGE',
  TOO_MANY_PAGES: 'OCR_TOO_MANY_PAGES',
  TOO_LONG: 'OCR_TOO_LONG',
  TIMEOUT: 'OCR_TIMEOUT',
  FAILED: 'OCR_FAILED',
});

/** Lỗi đọc chữ bằng AI mà KHÁCH đọc được: `message` là tiếng Việt, kèm gợi ý làm gì tiếp. `cause` giữ lỗi gốc cho log. */
export class OcrExtractionError extends Error {
  constructor(code, message, { status = 422, cause } = {}) {
    super(message);
    this.name = 'OcrExtractionError';
    this.code = code;
    this.status = status;
    if (cause) this.cause = cause;
  }
}

const OCR_SPLIT_HINT = 'Hãy tách tài liệu thành các tệp nhỏ hơn (vài chục trang mỗi tệp) rồi tải lên lại.';

/** Chặn TRƯỚC khi đọc cả tệp vào base64 / gọi Gemini: tệp quá khổ hoặc quá nhiều trang thì báo ngay, khỏi tốn lượt AI. */
function assertOcrInputAllowed(buffer, { numPages = null } = {}) {
  if (buffer.length > OCR_MAX_INPUT_BYTES) {
    const maxMb = Math.floor(OCR_MAX_INPUT_BYTES / (1024 * 1024));
    throw new OcrExtractionError(
      OCR_ERROR_CODES.TOO_LARGE,
      `Tệp quá nặng để AI đọc chữ (tối đa ${maxMb} MB). Hãy nén tệp hoặc tách nhỏ rồi tải lên lại.`,
      { status: 413 },
    );
  }
  if (Number.isFinite(numPages) && numPages > OCR_MAX_PDF_PAGES) {
    throw new OcrExtractionError(
      OCR_ERROR_CODES.TOO_MANY_PAGES,
      `Tài liệu có ${numPages} trang, vượt mức AI đọc được trong một lần (tối đa ${OCR_MAX_PDF_PAGES} trang). ${OCR_SPLIT_HINT}`,
    );
  }
}

/** Lỗi từ lõi Gemini (hết giờ, quá tải, 400…) → câu tiếng Việt cho khách; câu gốc của Google chỉ ở log máy chủ. */
function toOcrFailure(err) {
  if (err?.code === 'AI_TIMEOUT') {
    return new OcrExtractionError(
      OCR_ERROR_CODES.TIMEOUT,
      `Tài liệu quá dài hoặc quá nặng để AI đọc ngay trong một lần. ${OCR_SPLIT_HINT}`,
      { cause: err },
    );
  }
  return new OcrExtractionError(
    OCR_ERROR_CODES.FAILED,
    'AI chưa đọc được chữ trong tệp này (dịch vụ AI đang bận hoặc tệp không đọc được). Vui lòng thử lại sau ít phút; nếu vẫn lỗi, hãy chuyển tệp sang PDF hoặc DOCX có chữ.',
    { status: 503, cause: err },
  );
}

/**
 * Một lời gọi OCR: trần token + hạn chót tổng, ghi token, và `MAX_TOKENS` là LỖI (bản cũ trả phần đầu cụt như thể đã đọc xong).
 * Mọi lỗi ném ra đều là `OcrExtractionError`.
 */
async function runGeminiOcr(parts, { userId = null } = {}) {
  let model;
  let result;
  try {
    const { generateGeminiContent } = await import('./geminiClient.util.js');
    const { resolveAllowedModel } = await import('../services/ai/aiModelPolicy.service.js');
    // Model do super admin chọn, KHÔNG ghim tên. Bản cũ ghim cứng 'gemini-2.5-flash' từ 24/08 (không
    // ghi lý do) nên đường này không nghe theo lựa chọn của admin, và sẽ gãy riêng một mình khi Google
    // khai tử 2.5-flash như đã làm với 2.0-flash hôm 10/08. Đã thử thật trên production 24/09:
    // model hệ thống (gemini-3.5-flash) đọc đúng PDF/ảnh gửi kèm kiểu inlineData này.
    model = await resolveAllowedModel(null);
    result = await generateGeminiContent({
      parts,
      model,
      temperature: 0.1,
      maxOutputTokens: OCR_MAX_OUTPUT_TOKENS,
    });
  } catch (err) {
    console.error('[FileExtractor] OCR Gemini lỗi:', err?.message || err);
    throw toOcrFailure(err);
  }

  // Ghi TRƯỚC khi đọc kết quả: kể cả khi bài chỉ ra "NO_RELEVANT_TEXT_FOUND" hay bị cắt thì Google vẫn đã tính tiền lượt này.
  try {
    await recordOcrUsage(userId, result, model);
  } catch (err) {
    console.error('[FileExtractor] Ghi token OCR lỗi:', err?.message || err);
  }

  if (result?.finishReason === 'MAX_TOKENS') {
    console.warn(`[FileExtractor] OCR bị cắt ở trần ${OCR_MAX_OUTPUT_TOKENS} token — không lưu nội dung cụt`);
    throw new OcrExtractionError(
      OCR_ERROR_CODES.TOO_LONG,
      `Tài liệu quá dài: AI chỉ đọc hết được phần đầu. ${OCR_SPLIT_HINT}`,
    );
  }
  return result;
}

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
    // Lỗi OCR là lỗi KHÁCH đọc được (tệp quá dài/nặng, AI bận…): phải đến tay họ, không được nuốt thành '' rồi báo "không đọc được".
    if (e instanceof OcrExtractionError) throw e;
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
  let numPages = null;
  try {
    const pdfParse = (await import('pdf-parse')).default;
    // pdf.js 1.10/2.0 (đi kèm pdf-parse) đọc SAI khi nhận Node Buffer: báo "bad XRef entry" ở 2 lượt gọi đầu của mỗi tiến
    // trình (đo 20/09/2026), PDF có chữ bị đẩy sang OCR Gemini cả tệp (tốn tiền, đầu ra cắt ở 16.384 token). Đưa VIEW
    // Uint8Array (không sao chép) như `fileParser.util.js`; đừng đổi lại thành Buffer.
    const bytes = Buffer.isBuffer(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : buffer;
    const data = await pdfParse(bytes);
    numPages = Number(data?.numpages) || null;
    if (data.text && data.text.trim().length > 50) {
      return data.text.trim();
    }
  } catch (err) {
    console.error('[FileExtractor] PDF parse error:', err.message);
  }

  // Fallback to Gemini for scanned PDFs or exported presentations (like PowerPoint)
  assertOcrInputAllowed(buffer, { numPages });
  const parts = [
    {
      text: 'Extract all readable text from this document exactly as it appears. If there is no text but there is a clear diagram, chart, or visual data, describe it concisely. If it is just a decorative document with no useful text or data, output "NO_RELEVANT_TEXT_FOUND". Do not add any conversational filler.'
    },
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: buffer.toString('base64')
      }
    }
  ];

  const result = await runGeminiOcr(parts, { userId });
  if (result?.text?.includes('NO_RELEVANT_TEXT_FOUND')) {
    return '';
  }
  return result?.text?.trim() || '';
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
  assertOcrInputAllowed(buffer);
  let mimeType = 'image/jpeg';
  if (ext === 'png') mimeType = 'image/png';
  else if (ext === 'webp') mimeType = 'image/webp';

  const parts = [
    {
      text: 'Extract all readable text from this image exactly as it appears. If there is no text but there is a clear diagram, chart, or visual data, describe it concisely. If it is just a decorative image with no useful text or data, output "NO_RELEVANT_TEXT_FOUND". Do not add any conversational filler.'
    },
    {
      inlineData: {
        mimeType,
        data: buffer.toString('base64')
      }
    }
  ];

  const result = await runGeminiOcr(parts, { userId });
  if (result?.text?.includes('NO_RELEVANT_TEXT_FOUND')) {
    return '';
  }
  return result?.text || '';
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
