/**
 * Thoát các ký tự đặc biệt trong chuỗi để an toàn khi chèn vào HTML email.
 * Chuyển đổi &, <, >, ", ' thành các HTML entities tương ứng.
 *
 * @param {any} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
