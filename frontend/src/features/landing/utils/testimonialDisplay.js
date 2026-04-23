/**
 * Tạo chữ ký tắt 2 ký tự từ họ tên (ưu tiên chữ cái đầu họ + đầu tên).
 *
 * @param {string} name
 * @returns {string}
 */
export function initialsFromDisplayName(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0] || '';
    const b = parts[parts.length - 1][0] || '';
    return (a + b).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}
