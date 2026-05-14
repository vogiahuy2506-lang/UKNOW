import { Fragment } from 'react';

/* eslint-disable react-refresh/only-export-components -- renderBoldSegments helper exported with default component */
/**
 * Tách chuỗi thành các đoạn text và **in đậm** (markdown tối giản).
 *
 * Dùng non-greedy và cho phép khoảng trắng sau `**` mở / trước `**` đóng để khớp output Gemini thường gặp.
 *
 * @param {string} line
 * @returns {import('react').ReactNode[]}
 */
export function renderBoldSegments(line) {
  const s = String(line ?? '');
  const parts = s.split(/(\*\*[\s\S]*?\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*\s*([\s\S]+?)\s*\*\*$/);
    if (m) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {m[1]}
        </strong>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * Hiển thị nội dung insight dạng markdown nhẹ: đoạn văn + danh sách `- ` + **đậm**.
 *
 * Luồng:
 * 1. Quét từng dòng; gom các dòng `- ` liên tiếp thành một `<ul>`.
 * 2. Các dòng khác (không rỗng) gom thành đoạn `<p>` (nối nhiều dòng cùng khối).
 *
 * @param {{ text?: string }} props
 */
const InsightMarkdownBody = ({ text = '' }) => {
  const raw = String(text || '');
  if (!raw.trim()) return null;

  const lines = raw.split('\n');
  /** @type {{ type: 'ul' | 'p', items?: string[], text?: string }[]} */
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) {
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t.startsWith('- ')) break;
        items.push(t.slice(2).trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (trimmed === '') {
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === '' || t.startsWith('- ')) break;
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }

  if (blocks.length === 0) {
    return (
      <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{raw}</div>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((b, idx) =>
        b.type === 'ul' ? (
          <ul
            key={idx}
            className="list-disc pl-5 space-y-1.5 text-sm text-gray-700 leading-relaxed marker:text-gray-400"
          >
            {(b.items || []).map((item, j) => (
              <li key={j}>{renderBoldSegments(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={idx} className="text-sm text-gray-700 leading-relaxed">
            {renderBoldSegments(b.text || '')}
          </p>
        )
      )}
    </div>
  );
};

export default InsightMarkdownBody;
