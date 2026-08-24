/**
 * Tách văn bản thành các đoạn text và URL.
 * Tự động loại bỏ các dấu câu cuối câu ngoại lai dính vào URL (như '.', ',', '!', '?', ';', ':', ')', ']').
 *
 * Hỗ trợ 3 dạng:
 *   - http(s)://...   (giữ nguyên hành vi cũ, tách dấu câu cuối câu)
 *   - mailto:abc@x.y  (link email có sẵn scheme — không thêm target=_blank)
 *   - email thuần abc@x.y (auto-prefix "mailto:")
 *
 * @param {string} text
 * @returns {Array<{ type: 'text'|'link', text: string, url?: string }>}
 */
// eslint-disable-next-line react-refresh/only-export-components
export function splitTextAndLinks(text) {
  if (!text) return [];
  const str = String(text);

  // Một lần quét duy nhất: URL http/https, mailto: có sẵn, hoặc email thuần dạng
  // local@domain.tld. Dùng named pattern để phân biệt từng nhóm.
  // Lưu ý: chuỗi email không chứa whitespace, không nằm trong ngoặc kép.
  const regex = /(https?:\/\/[^\s"<>]+)|(mailto:[^\s"<>]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const rawParts = str.split(regex);

  const result = [];
  // Chuỗi ký tự phân cách dấu câu cuối URL — áp dụng cho cả http/https (giữ nguyên hành vi cũ).
  // Email / mailto thường đứng cuối câu với dấu chấm/phẩy → cũng nên tách tương tự để không
  // nuốt dấu câu thật.
  const trailingPunctPattern = /[.,!?:;"'>»]/;

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (!part) continue;

    const isHttp = part.startsWith('http://') || part.startsWith('https://');
    const isMailto = !isHttp && part.startsWith('mailto:');
    // Group 3 là email thuần (không có scheme).
    const isBareEmail = !isHttp && !isMailto && i >= 3 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(part);

    if (isHttp || isMailto || isBareEmail) {
      let url = part;
      let trailing = '';

      // Áp dụng tách dấu câu cuối cho cả 3 dạng (http/https, mailto có sẵn, email thuần).
      // Lý do: email thường đứng cuối câu, vd "...liên hệ support@uknow.vn." — nếu không
      // tách dấu chấm thì dấu chấm sẽ bị nuốt vào "email".
      while (url.length > 0) {
        const lastChar = url[url.length - 1];
        if (trailingPunctPattern.test(lastChar)) {
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
        // Email thuần → tự prefix "mailto:". mailto: có sẵn → giữ nguyên.
        // http(s) → giữ nguyên.
        const finalUrl = isBareEmail ? `mailto:${url}` : url;
        result.push({ type: 'link', url: finalUrl, text: url });
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
 *
 * Mặc định mọi <a> mở tab mới (`target="_blank"` + `rel="noopener noreferrer"`).
 * Với `mailto:` thì KHÔNG mở tab mới — trình duyệt/Outlook sẽ xử lý ngay tại tab hiện
 * tại (mở app email mặc định). Nếu cần tắt target=_blank cho cả http(s), truyền
 * `openInSameTab`.
 */
export function RenderTextWithLinks({
  text,
  className,
  linkClassName = 'underline break-all font-medium hover:opacity-80 transition-opacity',
  linkStyle,
  openInSameTab = false,
}) {
  if (!text) return null;
  const parts = splitTextAndLinks(text);

  const content = parts.map((part, index) => {
    if (part.type !== 'link') return part.text;
    const isMailto = /^mailto:/i.test(part.url);
    // mailto: luôn mở tại chỗ (mở app email). Người dùng có thể ép http(s) cũng mở
    // tại chỗ qua `openInSameTab`.
    const external = !isMailto && !openInSameTab;
    return (
      <a
        key={index}
        href={part.url}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={linkClassName}
        style={linkStyle}
      >
        {part.text}
      </a>
    );
  });

  if (className) {
    return <span className={className}>{content}</span>;
  }

  return <>{content}</>;
}

export default RenderTextWithLinks;
