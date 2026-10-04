/**
 * Trần cho nội dung cào từ URL để nạp vào kho kiến thức chatbot (D-18).
 *
 * Bản cũ: `innerText` của trang render (và chữ gỡ từ HTML tải về, tối đa 10 MB) ở `customChat.scrapeUrl` đi thẳng vào
 * tài liệu không có trần (đường KB cũ `chatbot.controller.addUrlDocument` đã tự cắt 50.000 ký tự). Một trang vài MB chữ (bảng
 * dữ liệu, trang liệt kê vô hạn) thành ~vài nghìn đoạn cần embed trong MỘT request, và nằm trọn trong RAM tiến trình backend
 * duy nhất.
 *
 * 200.000 ký tự ≈ 40% hạn mức kho kiến thức của gói trả phí thấp nhất (500.000 ký tự, migration 137) — dư sức cho một trang bài
 * viết/sản phẩm thật. Hạn mức theo gói (gói thử 100.000 ký tự tổng) vẫn do `kbQuota.service` chặn ở bước ghi tài liệu; trần này chỉ
 * giữ cho MỘT lượt cào không phình RAM/embedding trước khi tới bước đó.
 */
export const MAX_SCRAPED_TEXT_CHARS = 200000;

/**
 * Cắt `text` còn ≤ `maxChars` ký tự, không bỏ lại nửa cặp surrogate ở cuối. Không thêm dấu "…" (đây là tài liệu, không phải prompt).
 */
export function clipScrapedText(text, maxChars = MAX_SCRAPED_TEXT_CHARS) {
  const value = String(text ?? '');
  if (value.length <= maxChars) return value;
  let end = maxChars;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end);
}
