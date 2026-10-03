/**
 * Chia văn bản tài liệu kiến thức (chatbot Studio) thành các đoạn để embed + đưa vào prompt.
 *
 * Bản cũ (`CustomChatService.chunkText`) chỉ tách ở dòng trống và KHÔNG BAO GIỜ cắt một đoạn văn dài — tài liệu không
 * có dòng trống (DOCX bị xoá xuống dòng, PDF đọc thô…) thành ĐÚNG MỘT đoạn hàng trăm nghìn ký tự, mỗi câu trả lời của
 * chatbot kéo theo cả đoạn đó (đo production 03/10/2026: đoạn lớn nhất 219.902 ký tự, TB 94k token vào/câu).
 *
 * Quy tắc:
 *  - đoạn mục tiêu ~1.100 ký tự, CỨNG ≤ 1.500 (kể cả phần chồng lấn);
 *  - tách theo thứ tự đoạn văn (dòng trống) → dòng → câu (`. ! ? …`) → cắt cứng ở khoảng trắng → cắt cứng tại ký tự;
 *  - các đơn vị nhỏ được gộp lại tới mục tiêu; hai đoạn liền kề chồng lấn ~150 ký tự (đuôi đoạn trước, bắt đầu ở đầu từ);
 *  - không bao giờ cắt giữa cặp surrogate hay ngay trước dấu kết hợp (tiếng Việt dạng NFD); văn bản được chuẩn hoá NFC;
 *  - bỏ đoạn rỗng.
 *
 * Hàm thuần — không đọc DB/mạng.
 */

export const CHUNK_TARGET_CHARS = 1100;
export const CHUNK_MAX_CHARS = 1500;
export const CHUNK_OVERLAP_CHARS = 150;

/** Chỗ dành cho dấu nối (tối đa '\n\n') giữa phần chồng lấn và thân đoạn. */
const JOIN_RESERVE = 2;
/** Khi lấy đuôi chồng lấn: tìm đầu từ trong tối đa chừng này ký tự kể từ điểm cắt lý tưởng. */
const OVERLAP_WORD_SEARCH = 40;

/** Dấu kết hợp (Unicode category M) — tiếng Việt dạng NFD tách dấu thanh/dấu mũ khỏi chữ cái. */
const COMBINING_MARK = /\p{M}/u;

/** Mức tách tăng dần; `sep` là chuỗi nối lại khi gộp các đơn vị cùng mức. */
const SPLIT_LEVELS = [
  { regex: /\n{2,}/, sep: '\n\n' },
  { regex: /\n/, sep: '\n' },
  { regex: /(?<=[.!?…])\s+/, sep: ' ' },
];

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** Điểm cắt `index` KHÔNG được đứng trước một surrogate thấp hay dấu kết hợp — lùi dần về trước (không quá `minIndex`). */
function safeCutIndex(text, index, minIndex = 1) {
  let i = index;
  while (i > minIndex && (isLowSurrogate(text.charCodeAt(i)) || COMBINING_MARK.test(text[i]))) i -= 1;
  return i > minIndex ? i : index;
}

/** Cắt cứng thành các mảnh ≤ maxLen: ưu tiên khoảng trắng ở nửa sau cửa sổ, không có thì cắt tại ký tự (an toàn). */
function hardSplit(text, maxLen) {
  const pieces = [];
  let rest = text;
  let nextSep = '';
  while (rest.length > maxLen) {
    let cut = -1;
    const lowest = Math.floor(maxLen / 2);
    for (let i = maxLen; i >= lowest; i -= 1) {
      if (/\s/.test(rest[i])) {
        cut = i;
        break;
      }
    }
    let piece;
    let sepAfter;
    if (cut > 0) {
      piece = rest.slice(0, cut);
      rest = rest.slice(cut + 1);
      sepAfter = ' ';
    } else {
      cut = safeCutIndex(rest, maxLen);
      piece = rest.slice(0, cut);
      rest = rest.slice(cut);
      sepAfter = '';
    }
    const trimmed = piece.trim();
    if (trimmed) pieces.push({ text: trimmed, sep: nextSep });
    nextSep = sepAfter;
    rest = rest.replace(/^\s+/, '');
  }
  const last = rest.trim();
  if (last) pieces.push({ text: last, sep: nextSep });
  return pieces;
}

/** Đệ quy: biến văn bản thành các đơn vị ≤ maxUnit, mỗi đơn vị kèm chuỗi nối với đơn vị liền trước. */
function toUnits(text, maxUnit, level, sepBefore, out) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (trimmed.length <= maxUnit) {
    out.push({ text: trimmed, sep: sepBefore });
    return;
  }
  if (level >= SPLIT_LEVELS.length) {
    hardSplit(trimmed, maxUnit).forEach((piece, i) => {
      out.push({ text: piece.text, sep: i === 0 ? sepBefore : piece.sep });
    });
    return;
  }
  const { regex, sep } = SPLIT_LEVELS[level];
  const parts = trimmed.split(regex).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    toUnits(trimmed, maxUnit, level + 1, sepBefore, out);
    return;
  }
  parts.forEach((part, i) => toUnits(part, maxUnit, level + 1, i === 0 ? sepBefore : sep, out));
}

/** Đuôi ≤ overlap ký tự của thân đoạn trước, bắt đầu ở đầu một từ khi có thể. */
function overlapTail(body, overlap) {
  if (overlap <= 0 || !body) return '';
  if (body.length <= overlap) return body.trim();
  let start = body.length - overlap;
  const window = body.slice(start, start + OVERLAP_WORD_SEARCH);
  const wsAt = window.search(/\s/);
  if (wsAt !== -1) {
    start += wsAt + 1;
  } else {
    while (start < body.length && (isLowSurrogate(body.charCodeAt(start)) || COMBINING_MARK.test(body[start]))) start += 1;
  }
  return body.slice(start).trim();
}

/**
 * @param {string} text
 * @param {{ targetSize?: number, maxSize?: number, overlap?: number }} [options]
 * @returns {string[]} các đoạn, mỗi đoạn ≤ maxSize ký tự
 */
export function chunkText(text, options = {}) {
  const {
    targetSize = CHUNK_TARGET_CHARS,
    maxSize = CHUNK_MAX_CHARS,
    overlap = CHUNK_OVERLAP_CHARS,
  } = options;

  const normalized = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .normalize('NFC');
  if (!normalized.trim()) return [];

  // Thân đoạn tối đa = maxSize - phần chồng lấn - dấu nối, để đoạn thành phẩm không bao giờ vượt maxSize.
  const unitMax = Math.max(1, maxSize - overlap - JOIN_RESERVE);
  const units = [];
  toUnits(normalized, unitMax, 0, '', units);

  const bodies = [];
  let buffer = '';
  let bufferSep = '';
  for (const unit of units) {
    if (!buffer) {
      buffer = unit.text;
      bufferSep = unit.sep;
    } else if (buffer.length + unit.sep.length + unit.text.length <= targetSize) {
      buffer += unit.sep + unit.text;
    } else {
      bodies.push({ text: buffer, sep: bufferSep });
      buffer = unit.text;
      bufferSep = unit.sep;
    }
  }
  if (buffer) bodies.push({ text: buffer, sep: bufferSep });

  const chunks = [];
  bodies.forEach((body, i) => {
    const tail = i > 0 ? overlapTail(bodies[i - 1].text, overlap) : '';
    chunks.push(tail ? `${tail}${body.sep}${body.text}` : body.text);
  });

  // Lưới an toàn: bất biến "≤ maxSize" không phụ thuộc vào số học ở trên.
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxSize) {
      if (chunk.trim()) result.push(chunk);
    } else {
      hardSplit(chunk, maxSize).forEach((piece) => result.push(piece.text));
    }
  }
  return result;
}
