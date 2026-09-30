/**
 * Derived admin status cho voucher — PLAN_VOUCHER V-2b.
 * Trích ra file riêng để AdminVouchersPage.jsx chỉ export component
 * (fast-refresh chỉ hoạt động tốt khi file chỉ export components).
 */

/**
 * @param {object} voucher - Voucher record (có isActive, endsAt).
 * @param {number} [now=Date.now()] - Timestamp hiện tại (để test).
 * @returns {'active'|'expired'|'disabled'}
 */
export const getVoucherLifecycleStatus = (voucher, now = Date.now()) => {
  // Hạn được xét TRƯỚC cờ isActive: cờ này chỉ bị cron 00:30 hằng ngày hạ xuống (và cron đó nằm sau bước đồng bộ
  // khoá học nên có thể không chạy), trong khi cổng áp mã ở server đã chặn theo `ends_at >= NOW()`. Xét cờ trước
  // thì voucher quá hạn vẫn hiện "Đang chạy" ở trang admin dù khách không dùng được nữa (C-21).
  if (voucher.endsAt && new Date(voucher.endsAt).getTime() < now) return 'expired';
  if (voucher.isActive) return 'active';
  return 'disabled';
};