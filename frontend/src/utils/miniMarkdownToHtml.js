/**
 * Convert mini-markdown (same subset as miniMarkdown.jsx) to simple HTML for one-way upgrade.
 * Kept separate from RichTextEditor so react-refresh/only-export-components stays clean.
 * @param {string} md
 * @returns {string}
 */
export function miniMarkdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listItems = [];
  let para = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`);
    listItems = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    blocks.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const inline = (text) =>
    String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = Math.min(heading[1].length + 1, 4); // # → h2 (H1 reserved for title)
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks.join('') || '<p></p>';
}
