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
  // Simple PDF text extraction (basic implementation)
  // For production, use pdf-parse library
  const text = buffer.toString('latin1');
  const lines = text.split('\n');
  const content = [];

  for (const line of lines) {
    // Extract text between stream content markers
    if (line.includes('BT') || line.includes('ET')) continue;
    const cleaned = line.replace(/[^\x20-\x7E\n]/g, ' ').trim();
    if (cleaned.length > 5) {
      content.push(cleaned);
    }
  }

  return content.join('\n');
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
