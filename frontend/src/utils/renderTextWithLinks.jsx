/**
 * Tách văn bản thành các đoạn text và URL.
 * Tự động loại bỏ các dấu câu cuối câu ngoại lai dính vào URL (như '.', ',', '!', '?', ';', ':', ')', ']').
 *
 * @param {string} text
 * @returns {Array<{ type: 'text'|'link', text: string, url?: string }>}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function splitTextAndLinks(text) {
  if (!text) return [];
  const str = String(text);
  // Khớp URL bắt đầu bằng http:// hoặc https://, chặn ký tự whitespace, ngoặc nhọn <>, hoặc dấu ngoặc kép "
  const regex = /(https?:\/\/[^\s"<>]+)/g;
  const rawParts = str.split(regex);
  const result = [];

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (!part) continue;

    if (part.startsWith('http://') || part.startsWith('https://')) {
      let url = part;
      let trailing = '';

      // Tách dấu câu kết thúc câu không thuộc URL
      while (url.length > 0) {
        const lastChar = url[url.length - 1];
        if (/[.,!?:;"'>»]/.test(lastChar)) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else if (lastChar === ')' && (url.split(')').length - 1) > (url.split('(').length - 1)) {
          // Chỉ tách ngoặc đóng nếu số ngoặc đóng nhiều hơn số ngoặc mở trong URL
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else if (lastChar === ']' && (url.split(']').length - 1) > (url.split('[').length - 1)) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else if (lastChar === '}' && (url.split('}').length - 1) > (url.split('{').length - 1)) {
          trailing = lastChar + trailing;
          url = url.slice(0, -1);
        } else {
          break;
        }
      }

      if (url) {
        result.push({ type: 'link', url, text: url });
      }
      if (trailing) {
        if (result.length > 0 && result[result.length - 1].type === 'text') {
          result[result.length - 1].text += trailing;
        } else {
          result.push({ type: 'text', text: trailing });
        }
      }
    } else {
      if (result.length > 0 && result[result.length - 1].type === 'text') {
        result[result.length - 1].text += part;
      } else {
        result.push({ type: 'text', text: part });
      }
    }
  }

  return result;
}

/**
 * Component React render văn bản kèm link có thể click an toàn (XSS-safe).
 * Dùng React JSX để tự động escape nội dung văn bản.
 */
export function RenderTextWithLinks({
  text,
  className,
  linkClassName = 'underline break-all font-medium hover:opacity-80 transition-opacity',
  linkStyle,
}) {
  if (!text) return null;
  const parts = splitTextAndLinks(text);

  const content = parts.map((part, index) =>
    part.type === 'link' ? (
      <a
        key={index}
        href={part.url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
        style={linkStyle}
      >
        {part.text}
      </a>
    ) : (
      part.text
    )
  );

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return <>{content}</>;
}

export default RenderTextWithLinks;
