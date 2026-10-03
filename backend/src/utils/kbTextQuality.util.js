/**
 * Nhận diện văn bản "rác nhị phân" do bộ đọc PDF thô cũ tạo ra — dùng cho script nạp lại tài liệu cũ
 * (`scripts/rechunkCustomChatbotDocuments.js`).
 *
 * Bối cảnh: trước commit `0399b781` (24/08/2026 11:47 +07) `extractTextFromPdf` đọc PDF bằng
 * `buffer.toString('latin1')`, thay MỌI byte không in được bằng khoảng trắng rồi nối các dòng dài hơn 5 ký tự bằng `\n`.
 * Kết quả KHÔNG có ký tự điều khiển/thay thế nào (đã bị thay hết bằng khoảng trắng) nên "tỉ lệ ký tự không in được" của VĂN BẢN
 * ĐÃ LƯU gần như bằng 0 — không dùng được làm dấu hiệu chính. Dấu hiệu thật còn lại:
 *   1. cấu trúc PDF còn nguyên ở dạng chữ: `%PDF-1.x`, `endobj`, `endstream`, `/FlateDecode`, `/FontDescriptor`, `/Type /Page`, `xref`…
 *      (đoạn dictionary giữa các luồng nén luôn là ASCII) — ≥ 3 lần xuất hiện là kết luận chắc chắn;
 *   2. tỉ lệ ký tự điều khiển / ký tự thay thế U+FFFD > 2% — bắt các trường hợp tệp nhị phân khác bị đọc sai mã hoá;
 *   3. (chỉ khi tài liệu nạp TRƯỚC bản vá bộ đọc) tỉ lệ ký hiệu ASCII (dấu câu, ký tự lạ) trên ký tự không-trắng > 25%:
 *      luồng nén ngẫu nhiên giữ lại các byte 0x21–0x7E gần như đồng đều (≈ 34% là ký hiệu) còn văn bản tự nhiên ≈ 3–12%.
 *      Điều kiện thứ hai ("nạp trước bản vá") loại trừ PDF hợp lệ có nhiều ký hiệu (mục lục chấm chấm, bảng) nạp bằng bộ đọc mới.
 *
 * Hàm thuần.
 */

/** Thời điểm commit sửa bộ đọc PDF (`0399b781`). Tài liệu có `updated_at` trước mốc này đi qua bộ đọc thô cũ. */
export const PDF_PARSER_FIX_AT = '2026-08-24T11:47:08+07:00';

const PDF_STRUCTURE_MARKERS = /%PDF-\d|\bendobj\b|\bendstream\b|\/FlateDecode|\/FontDescriptor|\/Type\s*\/(?:Pages?|Catalog|Font|XObject)\b|\bxref\b/g;
const MIN_MARKERS = 3;
const MAX_CONTROL_RATIO = 0.02;
const MAX_SYMBOL_RATIO = 0.25;
const MIN_CHARS_FOR_RATIO = 200;
const SAMPLE_CHARS = 60000;

function isControlOrReplacement(code) {
  return (code <= 0x08)
    || code === 0x0b
    || code === 0x0c
    || (code >= 0x0e && code <= 0x1f)
    || (code >= 0x7f && code <= 0x9f)
    || code === 0xfffd;
}

/** Ký hiệu ASCII in được, không phải chữ/số/khoảng trắng. */
function isAsciiSymbol(code) {
  return (code >= 0x21 && code <= 0x2f)
    || (code >= 0x3a && code <= 0x40)
    || (code >= 0x5b && code <= 0x60)
    || (code >= 0x7b && code <= 0x7e);
}

/**
 * @param {string} text văn bản đã lưu của tài liệu (`custom_chatbot_documents.content_text`)
 * @param {{ beforeParserFix?: boolean }} [options] `beforeParserFix`: tài liệu nạp trước `PDF_PARSER_FIX_AT`
 * @returns {{ garbage: boolean, reason: null|'pdf_markers'|'control_chars'|'symbol_ratio', metrics: object }}
 */
export function detectRawPdfGarbage(text, { beforeParserFix = false } = {}) {
  const value = String(text || '');
  const sample = value.length > SAMPLE_CHARS ? value.slice(0, SAMPLE_CHARS) : value;
  const metrics = {
    sampleChars: sample.length,
    markers: 0,
    controlRatio: 0,
    symbolRatio: 0,
  };
  if (!sample.trim()) return { garbage: false, reason: null, metrics };

  metrics.markers = (sample.match(PDF_STRUCTURE_MARKERS) || []).length;

  let control = 0;
  let nonWhitespace = 0;
  let symbols = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (isControlOrReplacement(code)) control += 1;
    if (code > 0x20 && !(code >= 0x7f && code <= 0xa0)) {
      nonWhitespace += 1;
      if (isAsciiSymbol(code)) symbols += 1;
    }
  }
  metrics.controlRatio = control / sample.length;
  metrics.symbolRatio = nonWhitespace > 0 ? symbols / nonWhitespace : 0;

  if (metrics.markers >= MIN_MARKERS) return { garbage: true, reason: 'pdf_markers', metrics };
  if (sample.length >= MIN_CHARS_FOR_RATIO && metrics.controlRatio > MAX_CONTROL_RATIO) {
    return { garbage: true, reason: 'control_chars', metrics };
  }
  if (beforeParserFix && nonWhitespace >= MIN_CHARS_FOR_RATIO && metrics.symbolRatio > MAX_SYMBOL_RATIO) {
    return { garbage: true, reason: 'symbol_ratio', metrics };
  }
  return { garbage: false, reason: null, metrics };
}
