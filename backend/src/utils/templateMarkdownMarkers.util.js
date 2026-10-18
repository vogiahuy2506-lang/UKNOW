/**
 * Đổi dấu markdown đậm/nghiêng trong bodyHtml của mẫu thành thẻ HTML trước khi lưu.
 *
 * Biến mẫu `{{...}}` được GIỮ NGUYÊN: khoá có gạch dưới (ten_khach, email_khach, so_dien_thoai) trước đây bị
 * `_..._` nuốt ở giữa hai biến — `{{ten_khach}} ... {{email_khach}}` thành `{{ten<em>khach}} ... {{email</em>khach}}`
 * và biến không còn được thay khi gửi.
 *
 * @param {string} value
 * @returns {string}
 */
export function convertMarkdownMarkersKeepingVariables(value) {
  const stash = [];
  const text = String(value || '').replace(/\{\{[^{}]*\}\}/g, (match) => {
    stash.push(match);
    return `\u0000VAR${stash.length - 1}\u0000`;
  });

  const converted = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') // **bold**
    .replace(/\*(.+?)\*/g, '<em>$1</em>') // *italic*
    .replace(/__(.+?)__/g, '<strong>$1</strong>') // __bold__
    .replace(/_(.+?)_/g, '<em>$1</em>'); // _italic_

  return converted.replace(/\u0000VAR(\d+)\u0000/g, (_m, index) => stash[Number(index)]);
}
