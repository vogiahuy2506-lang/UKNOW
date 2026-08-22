/**
 * Format bot message content for display. Pure, dependency-free.
 *
 * Goals (Bug 4):
 *   1. Auto-linkify bare URLs ("https://example.com" → clickable link).
 *   2. Auto-linkify "Label: url" pairs so the user sees one clickable link
 *      instead of two pieces of plain text (which read as "duplicate links").
 *   3. Preserve newlines.
 *   4. Strip wrapping markdown link syntax that's already been turned into
 *      "Label: url" by the backend's stripMarkdown().
 *
 * Strategy: split on newline boundaries, then within each line:
 *   - find all URLs (http/https) with their optional leading "Label: " prefix
 *   - replace with React-safe DOM via {@link formatMessageSegments}
 *
 * @param {string} text - raw bot message
 * @returns {Array<{type: 'text'|'link', value: string}>}
 */
export function formatMessageSegments(text) {
  if (text == null) return [];
  const lines = String(text).split('\n');
  const out = [];

  // Matches "Label: https://..." or "Label: http://..." where Label is short
  // (1-80 chars, no colons inside). Greedy enough to capture marketing-style
  // prefixes like "Website chính: https://founderai.biz".
  const LABEL_URL = /^\s*([^:\n]{1,80}?):\s*(https?:\/\/[^\s]+)\s*$/;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    if (lineIdx > 0) out.push({ type: 'text', value: '\n' });
    const line = lines[lineIdx];

    // Try "Label: url" first.
    const labelMatch = line.match(LABEL_URL);
    if (labelMatch) {
      out.push({ type: 'text', value: `${labelMatch[1].trim()}: ` });
      out.push({ type: 'link', value: labelMatch[2].trim() });
      continue;
    }

    // Otherwise, scan for bare URLs anywhere in the line.
    const URL_RE = /https?:\/\/[^\s<>"']+/g;
    let lastIdx = 0;
    let m;
    let matchedAny = false;
    while ((m = URL_RE.exec(line)) !== null) {
      matchedAny = true;
      if (m.index > lastIdx) {
        out.push({ type: 'text', value: line.slice(lastIdx, m.index) });
      }
      out.push({ type: 'link', value: m[0] });
      lastIdx = m.index + m[0].length;
    }
    if (!matchedAny) {
      out.push({ type: 'text', value: line });
    } else if (lastIdx < line.length) {
      out.push({ type: 'text', value: line.slice(lastIdx) });
    }
  }

  return out;
}
