/**
 * Lọc URL đến từ nguồn bên ngoài (payload tin nhắn kênh Zalo/Facebook/..., dữ liệu tenant)
 * trước khi đưa vào `href` / `src` / `window.open` — chỉ nhận các scheme trong danh sách cho phép.
 *
 * Phân tích bằng URL parser chuẩn WHATWG (cùng bộ trình duyệt dùng khi điều hướng), nên
 * scheme được chuẩn hoá giống hệt lúc trình duyệt xử lý link: viết hoa/thường, ký tự điều
 * khiển ở đầu chuỗi, tab/xuống dòng chen giữa đều không lách qua được. Mặc định chỉ nhận URL
 * tuyệt đối; URL tương đối/không phân tích được coi là không an toàn.
 *
 * Trả về chuỗi gốc (đã trim) khi hợp lệ để giữ nguyên chữ hiển thị, '' khi không hợp lệ.
 */

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const IMAGE_PROTOCOLS = new Set(['http:', 'https:']);
const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+[;,]/i;

function parseUrl(value, baseUrl) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return { raw: trimmed, url: baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed) };
  } catch {
    return null;
  }
}

/**
 * URL dùng được cho `<a href>` / `window.open`: chỉ http, https, mailto, tel.
 *
 * @param {unknown} value
 * @param {string} [baseUrl] Có truyền thì URL tương đối được phân giải theo base này (link nội bộ
 *   của app); không truyền thì chỉ nhận URL tuyệt đối.
 * @returns {string} URL (đã trim) nếu an toàn, ngược lại ''
 */
export function getSafeLinkUrl(value, baseUrl) {
  const parsed = parseUrl(value, baseUrl);
  if (!parsed || !LINK_PROTOCOLS.has(parsed.url.protocol)) return '';
  return parsed.raw;
}

/**
 * URL dùng được cho `<img src>`: http, https hoặc `data:image/*`. Chỉ nhận URL tuyệt đối.
 *
 * @param {unknown} value
 * @returns {string} URL (đã trim) nếu an toàn, ngược lại ''
 */
export function getSafeImageUrl(value) {
  const parsed = parseUrl(value);
  if (!parsed) return '';
  if (IMAGE_PROTOCOLS.has(parsed.url.protocol)) return parsed.raw;
  if (parsed.url.protocol === 'data:' && DATA_IMAGE_RE.test(parsed.url.href)) return parsed.raw;
  return '';
}
