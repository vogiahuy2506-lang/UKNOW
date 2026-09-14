import { foldDiacritics } from './foldDiacritics.js';

// PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md, Việc 2.1 — nhận diện tin nhập vào ô chat
// là một trang HTML dán nguyên vào (không phải câu hỏi bình thường lỡ nhắc tới thẻ HTML).
const OPEN_TAG_RE = /<[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?>/g;
const TAG_RE = /<[^>]*>/g;

/**
 * true nếu `text` trông như một trang HTML dán nguyên vào.
 *
 * `<!doctype html>`/`<html>` là tín hiệu mạnh, đủ tự đứng một mình — không ai gõ câu hỏi bình
 * thường có nguyên cụm đó. Áp thêm ngưỡng "≥ 80% độ dài là thẻ" vào nhánh này sẽ loại nhầm chính
 * những trang landing thật có nội dung tiếng Việt bình thường (đo thực tế: một trang ngắn hợp lệ
 * chỉ ~76% ký tự là thẻ vì chữ hiển thị chiếm phần đáng kể — xem landingPaste.spec.js).
 *
 * `<body>` kèm ≥ 3 thẻ mở là tín hiệu YẾU hơn (một câu hỏi bình thường lỡ nhắc vài thẻ inline vẫn
 * có thể khớp) — CHỈ nhánh này mới cần thêm ngưỡng 80% để không bắt nhầm, ví dụ "sửa cho tôi cái
 * nút <button>Mua ngay</button>".
 */
export function looksLikeHtmlDocument(text) {
  const str = String(text || '').trim();
  if (!str) return false;

  const hasDoctypeOrHtmlTag = /<!doctype\s+html/i.test(str) || /<html[\s>]/i.test(str);
  if (hasDoctypeOrHtmlTag) return true;

  const hasBodyTag = /<body[\s>]/i.test(str);
  if (!hasBodyTag) return false;
  const openTagCount = (str.match(OPEN_TAG_RE) || []).length;
  if (openTagCount < 3) return false;

  const tagCharCount = (str.match(TAG_RE) || []).join('').length;
  return tagCharCount / str.length >= 0.8;
}

/**
 * Tách HTML nguyên vẹn ra khỏi phần chữ hướng dẫn thêm (nếu có) trong cùng một tin dán vào,
 * ví dụ: "<html>...</html>\ndùng trang này, đổi màu nút sang xanh" → html + "dùng trang này...".
 */
export function splitHtmlPaste(text) {
  const str = String(text || '');
  const docMatch = str.match(/<!doctype\s+html[^>]*>/i);
  const htmlTagMatch = !docMatch ? str.match(/<html[\s>]/i) : null;
  let htmlStart = docMatch ? docMatch.index : (htmlTagMatch ? htmlTagMatch.index : str.indexOf('<'));
  if (htmlStart < 0) htmlStart = 0;

  let htmlEnd = str.length;
  const lower = str.toLowerCase();
  const closeHtmlIdx = lower.lastIndexOf('</html>');
  const closeBodyIdx = lower.lastIndexOf('</body>');
  if (closeHtmlIdx >= 0) htmlEnd = closeHtmlIdx + '</html>'.length;
  else if (closeBodyIdx >= 0) htmlEnd = closeBodyIdx + '</body>'.length;
  else {
    const lastClose = str.lastIndexOf('>');
    if (lastClose >= 0) htmlEnd = lastClose + 1;
  }

  const html = str.slice(htmlStart, htmlEnd).trim();
  const instruction = `${str.slice(0, htmlStart)} ${str.slice(htmlEnd)}`.trim();
  return { html, instruction };
}

/**
 * Marker ngắn hiện trong lịch sử chat thay cho HTML thật — PHẢI khớp đúng chuỗi backend lưu
 * (ai.controller.js#landingFromHtml, PLAN_TRO_LY_CHINH_LANDING_TRON_GOI_2026-09-13.md Việc 1.1)
 * để tin vừa gửi và tin đọc lại sau F5 hiện giống nhau.
 */
export function buildLandingPasteMarker(title, htmlLength) {
  return `[Dán HTML có sẵn: "${title}", ${htmlLength} ký tự]`;
}

/**
 * Sinh slug gợi ý từ tiêu đề (bỏ dấu, chữ thường, nối bằng "-"), khớp SLUG_RE backend
 * (`^[a-z0-9][a-z0-9_-]*$`, landingPage.repository.js:4).
 */
export function slugifyLandingTitle(title) {
  return foldDiacritics(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
