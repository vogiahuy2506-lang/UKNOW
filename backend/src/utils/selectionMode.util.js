/**
 * Chế độ chọn người ở các khối đọc dữ liệu của chiến dịch (khách hàng `read_interested_customers`, bạn bè Zalo `get_all_friends`):
 *  - `all`         : lấy hết;
 *  - `fixed`       : CHỈ những id đã chọn;
 *  - `all_exclude` : hết, trừ những id bị loại.
 *
 * Quy tắc fail-closed (20/10/2026): chế độ KHAI TƯỜNG MINH là `fixed` mà danh sách chọn RỖNG thì KHÔNG chọn ai (0 người) — trước đây
 * rơi xuống "lấy hết", nên khối bị gỡ danh sách (vd chiến dịch mua từ Marketplace đã gỡ id khách/bạn bè của người bán) gửi cho TOÀN BỘ
 * khách / bạn bè của người dùng nếu họ bấm chạy mà chưa chọn lại. Giao diện vốn đã hiểu `fixed` + rỗng là "chưa chọn" (đỏ).
 *
 * Chế độ KHÔNG khai (rỗng / dữ liệu cũ) giữ quy tắc cũ của `resolveSelectionMode`: có id → `fixed`, không id → `all`.
 *
 * Thuần: không DB, không HTTP.
 */

/**
 * @param {string|undefined|null} mode giá trị `interestedSelectionMode` / `zaloFriendSelectionMode`
 * @param {Array<any>} selectedIds danh sách id đã chọn (dùng suy ra chế độ khi `mode` không khai)
 * @returns {'all'|'fixed'|'all_exclude'}
 */
export const resolveSelectionMode = (mode, selectedIds = []) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'fixed' || normalized === 'all_exclude') {
    return normalized;
  }
  return Array.isArray(selectedIds) && selectedIds.length > 0 ? 'fixed' : 'all';
};

/**
 * Lọc danh sách theo chế độ chọn.
 *  - `fixed`: giữ đúng các dòng có id nằm trong `selectedIds`; `selectedIds` rỗng → [] (không chọn ai);
 *  - `all_exclude`: bỏ các dòng có id trong `excludedIds` (loại rỗng → giữ hết);
 *  - `all`: giữ hết.
 *
 * @template T
 * @param {T[]} items
 * @param {{ mode: 'all'|'fixed'|'all_exclude', selectedIds?: Array<string|number>, excludedIds?: Array<string|number>, getId: (item: T) => string|number }} options
 *   `getId` phải trả cùng kiểu với phần tử `selectedIds` / `excludedIds` (so khớp bằng Set).
 * @returns {T[]}
 */
export function applyIdSelection(items, { mode, selectedIds = [], excludedIds = [], getId }) {
  const list = Array.isArray(items) ? items : [];
  if (mode === 'fixed') {
    const selected = new Set(selectedIds);
    return list.filter((item) => selected.has(getId(item)));
  }
  if (mode === 'all_exclude' && excludedIds.length > 0) {
    const excluded = new Set(excludedIds);
    return list.filter((item) => !excluded.has(getId(item)));
  }
  return list;
}

/**
 * Chế độ này có THU HẸP tập kết quả không (để ghi `meta.filtered` của log khối).
 *
 * @param {{ mode: 'all'|'fixed'|'all_exclude', excludedIds?: Array<string|number> }} options
 * @returns {boolean}
 */
export function isSelectionFiltered({ mode, excludedIds = [] }) {
  return mode === 'fixed' || (mode === 'all_exclude' && excludedIds.length > 0);
}

export default { resolveSelectionMode, applyIdSelection, isSelectionFiltered };
