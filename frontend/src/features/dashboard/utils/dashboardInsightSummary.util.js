/**
 * Rút gọn bản phân tích AI cho thẻ "Phân tích AI" trên trang Báo cáo.
 * Chỉ CHỌN từ các trường đã có (`overview`, `action_plan[].action`) — không sinh chữ mới, không đổi số liệu.
 */

/** Số câu tối đa của phần tổng quan ở chế độ gọn. */
export const COMPACT_OVERVIEW_MAX_SENTENCES = 3;
/** Số việc "Nên làm gì" tối đa ở chế độ gọn. */
export const COMPACT_ACTIONS_MAX = 3;

/**
 * Lấy tối đa `maxSentences` câu đầu của phần tổng quan (gộp xuống dòng thành khoảng trắng).
 *
 * @param {unknown} overview
 * @param {number} [maxSentences]
 * @returns {string}
 */
export function summarizeOverview(overview, maxSentences = COMPACT_OVERVIEW_MAX_SENTENCES) {
  if (typeof overview !== 'string') return '';
  const flat = overview.replace(/\s*\n+\s*/g, ' ').trim();
  if (!flat) return '';
  // Cắt ở dấu kết câu theo sau bởi khoảng trắng (số thập phân như 37.5 không bị cắt giữa chừng).
  const sentences = flat.split(/(?<=[.!?])\s+/);
  return sentences
    .slice(0, maxSentences)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Lấy tối đa `max` việc nên làm từ `action_plan`, giữ đúng thứ tự trong bản phân tích.
 *
 * @param {object|null} insights - payload đã chuẩn hóa
 * @param {number} [max]
 * @returns {string[]}
 */
export function pickTopActions(insights, max = COMPACT_ACTIONS_MAX) {
  const plan = insights?.action_plan;
  if (!Array.isArray(plan)) return [];
  const out = [];
  for (const item of plan) {
    const text = typeof item === 'string' ? item : item?.action;
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed) out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Hai bộ lọc có cùng khoảng ngày, loại kênh và tập chiến dịch không (so các trường mà bản lưu ghi).
 *
 * @param {object|null|undefined} a
 * @param {object|null|undefined} b
 * @returns {boolean}
 */
export function dashboardFiltersMatch(a, b) {
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ids = (f) =>
    Array.isArray(f.campaignIds)
      ? f.campaignIds.map(Number).filter(Number.isFinite).sort((x, y) => x - y)
      : [];
  const type = (f) => String(f.campaignType || 'all');
  if (String(a.startDate || '') !== String(b.startDate || '')) return false;
  if (String(a.endDate || '') !== String(b.endDate || '')) return false;
  if (type(a) !== type(b)) return false;
  return ids(a).join(',') === ids(b).join(',');
}
