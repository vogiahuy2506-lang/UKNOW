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

  return text
    .replace(/```[\w-]*\n?([\s\S]*?)```/gs, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    // Rewrite [label](url) → "label: url", and if the same URL appears
    // immediately after (Gemini emits both forms), drop the duplicate.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s+\2/gi, '$1: $2')
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
