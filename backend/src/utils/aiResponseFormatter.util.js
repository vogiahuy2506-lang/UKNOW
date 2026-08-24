/**
 * Convert AI output to plain text suitable for Zalo, Facebook, and web widgets.
 * Markdown markers are removed, while links are kept as readable plain URLs.
 *
 * Also strips duplicate URLs that appear right after a markdown-style link
 * label, e.g. "[Foo](https://x.com) https://x.com" → "Foo: https://x.com".
 * Without this, AI replies that include both a markdown link AND the same URL
 * as plain text (a common Gemini habit) render with the URL duplicated.
 */
export function stripMarkdown(text) {
  if (!text || typeof text !== 'string') return text || '';

  let result = text;

  // 1. Strip code blocks first
  result = result
    .replace(/```[\w-]*\n?([\s\S]*?)```/gs, '$1');

  // 2. Remove image markdown
  result = result
    .replace(/!\[.*?\]\(.+?\)/g, '');

  // 3. Remove bold and italic markers more safely
  result = result
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/~~(.+?)~~/gs, '$1');

  // 4. Strip inline code
  result = result
    .replace(/`([^`]+)`/gs, '$1');

  // 5. Remove duplicate URLs that appear immediately after markdown link on same line
  // e.g., "[Text](url) url" -> "Text: url"
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s+(https?:\/\/\S+)/gi, '$1: $2');

  // 6. Handle markdown links: [label](url) followed by duplicate URL on next line
  // Pattern: [text](url)\nurl -> text: url (only if same URL)
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*\n\s*(https?:\/\/[^)\s]+)/gi, (match, label, url1, url2) => {
    if (url1.toLowerCase() === url2.toLowerCase()) {
      return `${label}: ${url1}`;
    }
    return `${label}: ${url1}\n${url2}`;
  });

  // 7. Handle markdown links: [label](url) -> "label: url"
  result = result
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2');

  // 7. Remove duplicate consecutive URLs (common AI mistake)
  // e.g., "https://example.com\nhttps://example.com" -> "https://example.com"
  result = result.replace(/(https?:\/\/[^\s\n]+)\s*\n\s*\1/gi, '$1');

  // 8. Remove trailing duplicate URLs that follow a line with the same URL
  // e.g., "Link: https://example.com\nhttps://example.com" -> "Link: https://example.com"
  result = result.replace(/(https?:\/\/[^\s\n]+)\s*\n\s*(https?:\/\/[^\s\n]+)/gi, (match, url1, url2) => {
    if (url1.toLowerCase() === url2.toLowerCase()) {
      return url1;
    }
    return match;
  });

  // 9. Remove standalone duplicate URLs on consecutive lines
  result = result.split('\n').reduce((acc, line) => {
    const trimmed = line.trim();
    const last = acc[acc.length - 1];
    if (last) {
      const lastTrimmed = last.trim();
      if (
        trimmed.match(/^https?:\/\//i) &&
        lastTrimmed.match(/^https?:\/\//i) &&
        trimmed.toLowerCase() === lastTrimmed.toLowerCase()
      ) {
        return acc;
      }
    }
    acc.push(line);
    return acc;
  }, []).join('\n');

  // 10. Remove headings
  result = result
    .replace(/^#{1,6}\s+/gm, '');

  // 11. Normalize list markers
  result = result
    .replace(/^[\s]*[-*+]\s+/gm, '- ')
    .replace(/^>\s*/gm, '');

  // 12. Remove decorative lines
  result = result
    .replace(/^[-*_]{3,}\s*$/gm, '');

  // 13. Normalize multiple newlines
  result = result
    .replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

export function appendPlainTextResponseRules(systemPrompt = '') {
  return `${systemPrompt}

QUY TAC BAT BUOC VE DINH DANG:
- Tra loi bang VAN BAN THUAN, khong dung markdown.
- Khong dung **bold**, *italic*, heading, blockquote, code block.
- TUYET DOI KHONG DUOC phep tao link trung lap.
- Khi can gui link, chi hien thi URL mot lan duy nhat, vi du: "Email: example@domain.com" hoac "Website: https://example.com".
- Khong gui cung mot URL nhieu hon mot lan.
- Khong gui link dang markdown nhu [ten](https://example.com).`;
}
