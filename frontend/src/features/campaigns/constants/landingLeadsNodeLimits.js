/** Số lead tối đa mỗi lần truy vấn (đồng bộ backend `landingLeadsLimit.util.js`). */
export const LANDING_LEADS_MAX_RECORDS = 10000;

/**
 * Chuẩn hóa limit nhập trong form node.
 *
 * @param {string|number} raw
 * @param {number} fallback
 * @returns {number}
 */
export function clampLandingLeadsLimitUi(raw, fallback = 1000) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, LANDING_LEADS_MAX_RECORDS));
}
