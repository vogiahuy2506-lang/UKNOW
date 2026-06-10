/**
 * Convert AI output to plain text suitable for Zalo, Facebook, and web widgets.
 * Markdown markers are removed, while links are kept as readable plain URLs.
 */
export function stripMarkdown(text) {
  if (!text || typeof text !== 'string') return text || '';

  return text
    .replace(/```[\w-]*\n?([\s\S]*?)```/gs, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    // Remove bold and italic markers more safely
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/~~(.+?)~~/gs, '$1')
    .replace(/`([^`]+)`/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[\s]*[-*+]\s+/gm, '- ')
    .replace(/^>\s*/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function appendPlainTextResponseRules(systemPrompt = '') {
  return `${systemPrompt}

QUY TAC BAT BUOC VE DINH DANG:
- Tra loi bang VAN BAN THUAN, khong dung markdown.
- Khong dung **bold**, *italic*, heading, blockquote, code block.
- Neu can gui link, hien thi URL day du dang plain text, vi du: Ten trang: https://example.com.
- Khong gui link dang markdown nhu [ten](https://example.com).`;
}
