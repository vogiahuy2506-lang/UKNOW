/**
 * Extract text content from various file formats
 */

export async function extractTextFromBuffer(buffer, filename) {
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
        return await extractTextFromPdf(buffer);

      case 'doc':
      case 'docx':
        return await extractTextFromDocx(buffer);

      case 'xlsx':
      case 'xls':
        return await extractTextFromExcel(buffer);

      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
        return await extractTextFromImage(buffer, ext);

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

async function extractTextFromPdf(buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    console.error('[FileExtractor] PDF parse error:', err);
    return '';
  }
}

async function extractTextFromDocx(buffer) {
  // Basic DOCX extraction using JSZip
  try {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const content = await zip.file('word/document.xml')?.async('string');
    if (!content) return '';

    return extractTextFromHtml(content);
  } catch (e) {
    console.error('[FileExtractor] DOCX error:', e.message);
    return '';
  }
}

async function extractTextFromExcel(buffer) {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    let text = '';
    workbook.eachSheet((sheet) => {
      text += `--- Sheet: ${sheet.name} ---\n`;
      sheet.eachRow((row, rowNumber) => {
        const values = Array.isArray(row.values) ? row.values : Object.values(row);
        const rowText = values
          .slice(1) // Skip first empty cell
          .map(v => (v != null ? String(v) : ''))
          .filter(v => v.trim())
          .join(' | ');
        if (rowText.trim()) {
          text += `Row ${rowNumber}: ${rowText}\n`;
        }
      });
    });
    return text.trim();
  } catch (e) {
    console.error('[FileExtractor] Excel error:', e.message);
    return '';
  }
}

async function extractTextFromImage(buffer, ext) {
  try {
    const { generateGeminiContent } = await import('./geminiClient.util.js');
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

    const result = await generateGeminiContent({
      parts,
      model: 'gemini-2.5-flash',
      temperature: 0.1
    });

    if (result?.text?.includes('NO_RELEVANT_TEXT_FOUND')) {
      return '';
    }
    return result?.text || '';
  } catch (err) {
    console.error('[FileExtractor] Error extracting text from image:', err.message);
    return '';
  }
}
