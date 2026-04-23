/**
 * Giới hạn số bản ghi lead tối đa cho một lần truy vấn node «Dữ liệu landing page»
 * (đồng bộ với frontend Campaign Builder).
 */
export const MAX_LANDING_LEADS_LIMIT = 10000;

/**
 * Chuẩn hóa limit từ config/API về [1, MAX_LANDING_LEADS_LIMIT].
 *
 * @param {string|number|null|undefined} raw
 * @param {number} fallback mặc định khi không parse được
 * @returns {number}
 */
export function clampLandingLeadsLimit(raw, fallback = 1000) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, MAX_LANDING_LEADS_LIMIT));
}
