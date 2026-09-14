/** Số bài nộp tối đa mỗi lần truy vấn (đồng bộ backend `landingLeadsLimit.util.js` — dùng chung trần). */
export const FORM_SUBMISSIONS_MAX_RECORDS = 10000;

/**
 * Chuẩn hóa limit nhập trong form node.
 *
 * @param {string|number} raw
 * @param {number} fallback
 * @returns {number}
 */
export function clampFormSubmissionsLimitUi(raw, fallback = 1000) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(n, FORM_SUBMISSIONS_MAX_RECORDS));
}
