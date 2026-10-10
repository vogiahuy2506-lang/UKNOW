/**
 * Ngày giờ theo ngôn ngữ giao diện. Chuỗi rỗng nếu `value` không phải thời điểm hợp lệ.
 * @param {string|number|Date|null|undefined} value
 * @param {string} [locale] 'vi' | 'en'
 */
export function formatDateTime(value, locale = 'vi') {
  if (value == null || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default formatDateTime;
