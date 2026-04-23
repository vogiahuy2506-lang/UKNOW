/**
 * Chuẩn hóa gốc API cho lp-track / rewrite link: gộp lặp `/api/api` về một `/api`.
 * Tránh Route not found khi `VITE_API_URL` hoặc snippet đã chứa `/api` mà cấu hình lại nối thêm.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLandingLpTrackApiBase(raw) {
  let base = String(raw ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return base;
  while (/\/api\/api$/i.test(base)) {
    base = base.replace(/\/api\/api$/i, '/api');
  }
  return base;
}
