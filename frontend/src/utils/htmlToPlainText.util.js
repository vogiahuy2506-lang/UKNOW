/**
 * Strip HTML tags to plain text, preserving paragraph and line breaks as
 * `\n`. Used to build the `text` fallback when sending HTML email so that
 * mail clients without HTML support still show readable content.
 *
 * Intentionally lightweight — not a full HTML parser. Designed for
 * email-template bodies authored in our rich editor (h1..h6, p, br, li,
 * strong, em, a, span, div, table). It is *not* safe to use on
 * untrusted / attacker-controlled HTML.
 *
 * @param {string} html - raw HTML string. If null/undefined, returns ''.
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (html == null) return '';
  let s = String(html);

  // Remove script and style blocks
  s = s.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '');
  s = s.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, '');

  const PARAGRAPH_BREAK = '\x00PARA\x00';
  const LINE_BREAK = '\x00BR\x00';

  // Handle horizontal rules as paragraph separators (before tag processing)
  s = s.replace(/<[^>]*---[^>]*>/gi, PARAGRAPH_BREAK);
  s = s.replace(/\s*---+\s*/g, PARAGRAPH_BREAK); // standalone --- lines
  s = s.replace(/<\s*\/?\s*(p|div|h[1-6]|li|tr|table)[^>]*>/gi, PARAGRAPH_BREAK);
  s = s.replace(/<\s*(br|hr)[^>]*>/gi, LINE_BREAK);

  // Strip all tags
  s = s.replace(/<[^>]+>/g, '');

  // Decode entities
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Strip markdown bold/italic markers before processing
  s = s.replace(/\*\*(.+?)\*\*/g, '$1'); // **bold** → bold
  s = s.replace(/\*(.+?)\*/g, '$1');     // *italic* → italic
  s = s.replace(/__(.+?)__/g, '$1');     // __bold__ → bold
  s = s.replace(/_(.+?)_/g, '$1');       // _italic_ → italic

  // Strip horizontal rules (---) used as visual separators
  s = s.replace(/-{3,}/g, ' '); // all --- sequences → space

  // Normalize: split by paragraph, preserve line breaks, trim whitespace
  s = s
    .split(PARAGRAPH_BREAK)
    .map((block) => {
      // Replace line break placeholders with newlines, trim, collapse inner whitespace.
      // Use split/join to convert every occurrence (replace only swaps the first hit).
      return block
        .split(LINE_BREAK)
        .join('\n')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 0)
        .join('\n');
    })
    .filter((block) => block.length > 0)
    .join('\n\n');

  return s;
}