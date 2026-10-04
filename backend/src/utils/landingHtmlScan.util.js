/**
 * Bộ quét thẻ HTML tối giản cho các chốt đầu ra của AI landing (landingHtmlSafety.util.js,
 * landingHtmlImageRefs.util.js, landingEditGuard.util.js). Thuần, không phụ thuộc DOM/HTTP/DB.
 *
 * Vì sao không dùng regex `<tag[^>]*>`: chốt an toàn mà bộ quét hiểu HTML KHÁC trình duyệt thì có
 * lối lách. Ví dụ `<a title="<!-- ">` + `<script>…</script>` + `<!-- ">`: regex tưởng thẻ script nằm trong
 * chú thích, trình duyệt thì chạy nó. Bộ này đi theo tokenizer HTML5 ở những chỗ quan trọng:
 *   - chú thích `<!-- … -->` (kể cả dạng đóng sớm `<!-->`, `<!--->`, và `--!>`), `<!…>`, `<?…>`, `</` + ký tự lạ;
 *   - tên thuộc tính tách bằng khoảng trắng HOẶC `/` (`<img/src=x/onerror=alert(1)>`), giá trị có/không nháy;
 *   - nội dung các thẻ "chữ thô" (script, style, textarea, title, iframe, xmp, noembed, noframes, noscript)
 *     bị bỏ qua khi tìm cấu trúc — và ĐỒNG THỜI được quét lại như HTML thường: trình duyệt coi
 *     `<svg><title>…` / `<svg><style>…` là thẻ HTML bình thường (không phải chữ thô), nên quét cả hai cách
 *     thì không có chỗ nào bị che. Quét thừa chỉ gây báo thừa (đã có so sánh với bản cũ lo), không gây sót.
 *
 * Giới hạn có chủ ý: không dựng cây DOM, không xử lý `<template>`/foreign content ngoài phép quét kép trên.
 */

const RAW_TEXT_TAGS = new Set(['style', 'title', 'textarea', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);

/** Độ sâu tối đa khi quét lại nội dung thẻ chữ thô lồng nhau; sâu hơn → token `overflow` (chốt an toàn coi là lạ). */
const MAX_RAW_NEST_DEPTH = 4;

const isAlpha = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';

const closeTagRegexCache = new Map();
function closeTagRegex(name) {
  let re = closeTagRegexCache.get(name);
  if (!re) {
    // `</script` theo sau là khoảng trắng, `/` hoặc `>` mới đóng thẻ (đúng tokenizer HTML5).
    re = new RegExp(`</${name.replace(/[^a-z0-9]/g, '')}(?=[\\s/>])`, 'ig');
    closeTagRegexCache.set(name, re);
  }
  return re;
}

/**
 * Phân tích một thẻ mở/đóng bắt đầu tại `lt` (vị trí ký tự `<`).
 * @returns {{ name: string, attrs: Array<[string, string]>, selfClosing: boolean, end: number }|null}
 *   null = thẻ chưa đóng khi hết chuỗi (trình duyệt bỏ thẻ này và phần còn lại).
 */
function parseTag(s, lt, isEnd) {
  const n = s.length;
  let i = lt + (isEnd ? 2 : 1);
  const nameStart = i;
  while (i < n && !isSpace(s[i]) && s[i] !== '/' && s[i] !== '>') i++;
  const name = s.slice(nameStart, i).toLowerCase();
  const attrs = [];
  const seen = new Set();
  let selfClosing = false;

  for (;;) {
    while (i < n && (isSpace(s[i]) || s[i] === '/')) {
      if (s[i] === '/' && s[i + 1] === '>') selfClosing = true;
      i++;
    }
    if (i >= n) return null;
    if (s[i] === '>') return { name, attrs, selfClosing, end: i + 1 };

    // Tên thuộc tính; ký tự đầu (kể cả `=`) luôn thuộc về tên — đúng tokenizer HTML5.
    const attrStart = i;
    i++;
    while (i < n && !isSpace(s[i]) && s[i] !== '/' && s[i] !== '>' && s[i] !== '=') i++;
    const attrName = s.slice(attrStart, i).toLowerCase();
    while (i < n && isSpace(s[i])) i++;

    let value = '';
    if (s[i] === '=') {
      i++;
      while (i < n && isSpace(s[i])) i++;
      const quote = s[i];
      if (quote === '"' || quote === "'") {
        const close = s.indexOf(quote, i + 1);
        if (close === -1) return null;
        value = s.slice(i + 1, close);
        i = close + 1;
      } else {
        const valueStart = i;
        while (i < n && !isSpace(s[i]) && s[i] !== '>') i++;
        value = s.slice(valueStart, i);
      }
    }
    // Trùng tên thuộc tính: trình duyệt giữ cái ĐẦU TIÊN.
    if (!seen.has(attrName)) {
      seen.add(attrName);
      attrs.push([attrName, value]);
    }
  }
}

function skipComment(s, lt) {
  const n = s.length;
  const j = lt + 4;
  if (s[j] === '>') return j + 1; // `<!-->`
  if (s[j] === '-' && s[j + 1] === '>') return j + 2; // `<!--->`
  const a = s.indexOf('-->', j);
  const b = s.indexOf('--!>', j);
  if (a === -1 && b === -1) return n;
  if (b === -1 || (a !== -1 && a < b)) return a + 3;
  return b + 4;
}

function scanInto(s, out, depth) {
  const n = s.length;
  let i = 0;
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt === -1) return;
    const next = s[lt + 1];

    if (next === '!') {
      if (s.startsWith('<!--', lt)) {
        i = skipComment(s, lt);
      } else {
        const gt = s.indexOf('>', lt + 2);
        i = gt === -1 ? n : gt + 1;
      }
      continue;
    }
    if (next === '?') {
      const gt = s.indexOf('>', lt + 2);
      i = gt === -1 ? n : gt + 1;
      continue;
    }
    if (next === '/') {
      if (isAlpha(s[lt + 2])) {
        const tag = parseTag(s, lt, true);
        if (!tag) return;
        out.push({ type: 'end', name: tag.name, index: lt, end: tag.end, depth });
        i = tag.end;
      } else {
        const gt = s.indexOf('>', lt + 2);
        if (gt === -1) return;
        i = gt + 1;
      }
      continue;
    }
    if (!isAlpha(next)) {
      i = lt + 1;
      continue;
    }

    const tag = parseTag(s, lt, false);
    if (!tag) return;
    const token = { type: 'start', name: tag.name, attrs: tag.attrs, selfClosing: tag.selfClosing, index: lt, end: tag.end, depth };
    out.push(token);
    i = tag.end;

    if (tag.name === 'script' || RAW_TEXT_TAGS.has(tag.name)) {
      const re = closeTagRegex(tag.name);
      re.lastIndex = i;
      const m = re.exec(s);
      const contentEnd = m ? m.index : n;
      token.content = s.slice(i, contentEnd);
      if (token.content) {
        if (depth >= MAX_RAW_NEST_DEPTH) out.push({ type: 'overflow', index: i });
        else scanInto(token.content, out, depth + 1);
      }
      i = contentEnd;
    }
  }
}

/**
 * Quét HTML thành dãy token thẻ theo thứ tự xuất hiện.
 * - `{ type: 'start', name, attrs: [[tên, giá trị], …], selfClosing, index, end, depth, content? }` — `content` chỉ
 *   có ở thẻ chữ thô (script/style/…): đoạn chữ tới `</tên`; token của thẻ nằm TRONG đoạn đó được nối ngay sau.
 *   `index`/`end` là vị trí `<` và vị trí ngay sau `>`; chỉ đáng tin khi `depth === 0` (token ở nội dung quét lại
 *   của thẻ chữ thô có vị trí tính từ đầu đoạn đó).
 * - `{ type: 'end', name, index, end, depth }`
 * - `{ type: 'overflow', index }` — thẻ chữ thô lồng quá sâu (hình dạng bất thường).
 *
 * Tên thẻ và tên thuộc tính viết thường; giá trị thuộc tính CHƯA giải mã thực thể (dùng `decodeHtmlEntities`).
 *
 * @param {string} html
 * @returns {Array<object>}
 */
export function scanHtmlTags(html) {
  const out = [];
  scanInto(String(html ?? ''), out, 0);
  return out;
}

/** Giá trị thuộc tính `name` của token start; không có → null. */
export function getAttr(token, name) {
  const hit = token?.attrs?.find(([key]) => key === name);
  return hit ? hit[1] : null;
}

const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  colon: ':',
  tab: '\t',
  newline: '\n',
  lpar: '(',
  rpar: ')',
  sol: '/',
  bsol: '\\',
  period: '.',
  comma: ',',
  semi: ';',
  equals: '=',
  quest: '?',
  num: '#',
  nbsp: ' ',
};

/**
 * Giải mã tham chiếu ký tự trong giá trị thuộc tính (một lượt, như trình duyệt): `&#106;`, `&#x6A;`,
 * `&colon;`, `&Tab;`, `&amp;`… Tên không biết thì giữ nguyên. Dùng để so khớp `javascript:` / URL, không để hiển thị.
 */
export function decodeHtmlEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);?/gi, (whole, body) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return REPLACEMENT_CHAR;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}
