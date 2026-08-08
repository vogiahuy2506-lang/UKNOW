/**
 * Bộ render Markdown tối giản cho nội dung help_articles.body_md.
 * Hỗ trợ: # ## ### heading, - / * bullet list, **bold**, [text](url).
 * Không dùng lib ngoài (marked/react-markdown chưa có trong package.json)
 * và không cần dangerouslySetInnerHTML vì mọi thứ render qua JSX.
 */

const INLINE_TOKEN_REGEX = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

/**
 * Render nội dung 1 dòng, hỗ trợ **bold** và [text](url).
 * @param {string} text
 * @returns {Array<string|import('react').ReactNode>}
 */
function renderInline(text) {
  const parts = text.split(INLINE_TOKEN_REGEX);
  return parts.filter((p) => p !== '').map((part, idx) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={idx}>{boldMatch[1]}</strong>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target={linkMatch[2].startsWith('http') ? '_blank' : undefined}
          rel={linkMatch[2].startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-primary-600 underline hover:text-primary-700"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

/**
 * Chuyển markdown đơn giản thành mảng React node.
 * @param {string} md
 * @returns {Array<import('react').ReactNode>}
 */
export function renderMiniMarkdown(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let listBuffer = null;

  const flushList = () => {
    if (listBuffer && listBuffer.items.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1 my-3 text-slate-700">
          {listBuffer.items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    }
    listBuffer = null;
  };

  let paragraphBuffer = [];
  const flushParagraph = () => {
    if (paragraphBuffer.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-slate-700 leading-relaxed my-3">
          {renderInline(paragraphBuffer.join(' '))}
        </p>
      );
      paragraphBuffer = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.*)$/);
    const h2 = trimmed.match(/^##\s+(.*)$/);
    const h1 = trimmed.match(/^#\s+(.*)$/);
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);

    if (h1) {
      flushParagraph(); flushList();
      blocks.push(<h1 key={`h1-${blocks.length}`} className="text-2xl font-bold text-slate-900 mt-6 mb-3">{renderInline(h1[1])}</h1>);
      continue;
    }
    if (h2) {
      flushParagraph(); flushList();
      blocks.push(<h2 key={`h2-${blocks.length}`} className="text-xl font-semibold text-slate-900 mt-6 mb-2">{renderInline(h2[1])}</h2>);
      continue;
    }
    if (h3) {
      flushParagraph(); flushList();
      blocks.push(<h3 key={`h3-${blocks.length}`} className="text-lg font-semibold text-slate-900 mt-4 mb-2">{renderInline(h3[1])}</h3>);
      continue;
    }
    if (bullet) {
      flushParagraph();
      if (!listBuffer) listBuffer = { items: [] };
      listBuffer.items.push(bullet[1]);
      continue;
    }

    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks;
}
