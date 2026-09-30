/**
 * Trạng thái đơn hàng (orders.status) → khoá i18n + lớp màu — MỘT bảng cho Tổng quan admin và trang Đơn hàng.
 *
 * DB dùng success / pending / cancelled / failed / refunded (migration 253). Tổng quan từng có bảng riêng chỉ với
 * completed / pending / cancelled nên đơn đã trả hiện chữ "success" nền xám, đơn failed / refunded hiện chữ thô;
 * trang Đơn hàng dùng lớp badge-green / badge-yellow / badge-red KHÔNG tồn tại trong index.css (badge không có màu).
 * Lớp màu ở đây là các lớp có thật: badge-success / warning / gray / error / info.
 */
export const ORDER_STATUS_BADGE = Object.freeze({
  success: { labelKey: 'orders.success', className: 'badge-success' },
  pending: { labelKey: 'orders.pending', className: 'badge-warning' },
  cancelled: { labelKey: 'orders.cancelled', className: 'badge-gray' },
  failed: { labelKey: 'orders.failed', className: 'badge-error' },
  refunded: { labelKey: 'orders.refunded', className: 'badge-info' },
});

/**
 * @param {string} status
 * @param {(key: string) => string} t
 * @returns {{ label: string, className: string }}
 */
export function orderStatusBadge(status, t) {
  const entry = ORDER_STATUS_BADGE[status];
  if (!entry) return { label: status, className: 'badge-gray' };
  return { label: t(entry.labelKey), className: entry.className };
}
