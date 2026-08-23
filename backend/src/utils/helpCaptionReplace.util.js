/**
 * Thay một ô chú thích "[ẢNH: …]" trong body_html bằng thẻ <img> thật.
 *
 * Dùng cho luồng chụp ảnh tự động (xem e2e/screenshots/): Playwright chụp màn
 * hình theo mô tả của từng ô chú thích, rồi script chèn ảnh vào đúng ô đó.
 *
 * Nguyên tắc giống hệt phần khôi phục ảnh ở helpImageRecovery.util.js: KHÔNG bao
 * giờ đoán. Khoá tìm kiếm phải khớp đúng MỘT ô; khớp 0 hoặc nhiều hơn 1 thì từ
 * chối, vì đặt nhầm ảnh vào bước khác là lỗi người đọc không tự phát hiện được.
 */

/** Một đoạn <p> chứa chú thích ảnh. */
const CAPTION_PARAGRAPH = /<p\b[^>]*>\s*\[(?:ẢNH|ANH|IMAGE)\s*:([\s\S]*?)\]\s*<\/p>/gi;

/**
 * Giải mã các thực thể HTML thường gặp.
 *
 * Chú thích lấy ra từ body_html đã qua sanitize nên dấu nháy kép nằm ở dạng
 * &quot;. Dùng thẳng chuỗi đó làm alt rồi escape lần nữa sẽ ra &amp;quot; hiện
 * lù lù trên trang — phải giải mã trước, escape sau, đúng một lần.
 */
function decodeHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');   // sau cùng, tránh giải mã hai lần chuỗi &amp;quot;
}

/**
 * Chuẩn hoá chuỗi để so khớp: giải mã thực thể HTML thường gặp, bỏ dấu nháy,
 * gom khoảng trắng, hạ chữ thường. Chú thích trong DB đã qua sanitize nên dấu
 * nháy kép nằm ở dạng &quot;, còn khoá viết trong file định nghĩa thì viết thẳng.
 */
export function normalizeCaption(text) {
  return decodeHtmlEntities(text)
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Liệt kê mọi ô chú thích trong bài, kèm vị trí trong chuỗi.
 *
 * @param {string} html
 * @returns {Array<{start:number,end:number,text:string,normalized:string}>}
 */
export function listCaptionSlots(html) {
  const slots = [];
  const source = String(html ?? '');
  CAPTION_PARAGRAPH.lastIndex = 0;
  let match;
  while ((match = CAPTION_PARAGRAPH.exec(source)) !== null) {
    slots.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[1].trim(),
      normalized: normalizeCaption(match[1]),
    });
  }
  return slots;
}

/** Thoát ký tự cho thuộc tính HTML — alt lấy từ chính chú thích nên phải thoát. */
function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Thay ô chú thích khớp `captionKey` bằng thẻ <img src>.
 *
 * @param {string} html body_html hiện tại
 * @param {string} captionKey một đoạn chữ đủ riêng để nhận ra ô cần thay
 * @param {string} imageUrl URL ảnh đã tải lên
 * @returns {{ok:true, html:string, caption:string} | {ok:false, reason:string, matches:number}}
 */
export function replaceCaptionWithImage(html, captionKey, imageUrl) {
  const source = String(html ?? '');
  const key = normalizeCaption(captionKey);
  if (!key) return { ok: false, reason: 'khoá tìm kiếm rỗng', matches: 0 };
  if (!imageUrl) return { ok: false, reason: 'thiếu URL ảnh', matches: 0 };

  const slots = listCaptionSlots(source);
  const hits = slots.filter((slot) => slot.normalized.includes(key));

  if (hits.length === 0) {
    return { ok: false, reason: 'không tìm thấy ô chú thích nào khớp', matches: 0 };
  }
  if (hits.length > 1) {
    // Khớp nhiều ô thì không biết ô nào — viết khoá riêng hơn, đừng để máy chọn.
    return { ok: false, reason: `khoá khớp ${hits.length} ô khác nhau — cần khoá riêng hơn`, matches: hits.length };
  }

  const slot = hits[0];
  const alt = escapeAttribute(decodeHtmlEntities(slot.text));
  const img = `<img src="${escapeAttribute(imageUrl)}" alt="${alt}">`;
  return {
    ok: true,
    html: source.slice(0, slot.start) + img + source.slice(slot.end),
    caption: slot.text,
  };
}
